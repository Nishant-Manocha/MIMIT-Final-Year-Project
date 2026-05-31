const KNOWN_EDU_CHANNELS = [
  "gate smashers",
  "neso academy",
  "made easy",
  "knowledge gate",
  "unacademy",
  "ravindrababu ravula",
  "apna college",
  "take u forward",
  "codehelp",
  "geeksforgeeks",
  " Jenny's lectures".trim().toLowerCase(),
];

const EXAM_TERMS = {
  gate: ["gate", "pyq", "previous year", "numerical", "concept", "cs"],
  semester: ["semester", "one shot", "important questions", "derivation", "university"],
  placement: ["placement", "interview", "aptitude", "coding", "dsa", "pattern"],
  competitive: ["competitive exam", "mcq", "practice", "mock", "revision"],
};

export function buildYoutubeRecommendations(input = {}) {
  const topics = normalizeTopics(input.extracted_topics || input.topics || []);
  const preferences = normalizePreferences(input.preferences || input);
  const context = input.context || {};
  const queryPlans = buildQueryPlans(topics, preferences, context);
  const candidates = buildCandidates(queryPlans, preferences);
  const rankedVideos = rankCandidates(candidates.filter((item) => item.type === "video"), preferences);
  const rankedPlaylists = rankCandidates(
    candidates.filter((item) => item.type === "playlist"),
    preferences,
  );

  return {
    engine: "free-youtube-search-v1",
    strategy:
      "Uses direct YouTube search URLs first, ranks educational intent with topic/exam/style/time heuristics, and can be upgraded with yt-dlp transcripts, sentence-transformer embeddings, FAISS, and Redis caching.",
    filters: {
      exam_type: preferences.exam_type,
      language: preferences.language,
      teaching_style: preferences.teaching_style,
      study_time_minutes: preferences.study_time_minutes,
      level: preferences.level,
      mode: preferences.mode,
    },
    learning_path: buildLearningPath(topics, preferences),
    ranked_videos: rankedVideos.slice(0, 10),
    ranked_playlists: rankedPlaylists.slice(0, 6),
    best_picks: buildBestPicks(rankedVideos, rankedPlaylists),
    implementation_notes: [
      "Cache search results, transcripts, thumbnails, and embeddings by video id.",
      "Use yt-dlp or youtube-transcript-api to collect transcripts without paid APIs.",
      "Use all-MiniLM-L6-v2 embeddings + FAISS for semantic relevance.",
      "Use Whisper ASR only when captions/transcripts are missing.",
      "Deduplicate by normalized title and channel before ranking.",
      "Penalize clickbait, outdated content, weak exam terms, and poor transcript density.",
    ],
  };
}

function normalizeTopics(rawTopics) {
  const topics = (Array.isArray(rawTopics) ? rawTopics : [])
    .map((topic) => ({
      subject: String(topic.subject || topic.course || "General").slice(0, 80),
      topic: String(topic.topic || topic.title || topic.name || "").slice(0, 120),
      subtopics: Array.isArray(topic.subtopics) ? topic.subtopics.map(String).slice(0, 8) : [],
      keywords: Array.isArray(topic.keywords) ? topic.keywords.map(String).slice(0, 12) : [],
      difficulty: String(topic.difficulty || "medium").toLowerCase(),
      concept_type: String(topic.concept_type || topic.type || "mixed").toLowerCase(),
    }))
    .filter((topic) => topic.topic);

  return topics.length
    ? topics
    : [
        {
          subject: "Operating Systems",
          topic: "Deadlock",
          subtopics: ["Coffman conditions", "Banker's algorithm", "PYQ"],
          keywords: ["deadlock", "safe state", "resource allocation graph"],
          difficulty: "medium",
          concept_type: "conceptual + numerical",
        },
      ];
}

function normalizePreferences(input) {
  return {
    exam_type: String(input.exam_type || input.goal || "GATE").toLowerCase(),
    language: String(input.language || input.preferred_language || "English").toLowerCase(),
    teaching_style: String(input.teaching_style || input.preferred_teaching_style || "exam-oriented").toLowerCase(),
    study_time_minutes: Number(input.study_time_minutes || input.available_time_minutes || 120),
    level: String(input.level || input.preparation_level || "beginner").toLowerCase(),
    mode: String(input.mode || input.preparation_mode || "deep-learning").toLowerCase(),
    prefer_short: Boolean(input.prefer_short || input.short_videos),
  };
}

function buildQueryPlans(topics, preferences, context) {
  const examKey = getExamKey(preferences.exam_type);
  const weakTerms = Array.isArray(context.weak_topics) ? context.weak_topics.map(String) : [];
  return topics.flatMap((topic) => {
    const base = [preferences.exam_type, topic.subject, topic.topic].filter(Boolean).join(" ");
    const language = languageTerm(preferences.language);
    const terms =
      preferences.study_time_minutes <= 90 || preferences.mode.includes("revision")
        ? ["one shot", "revision", "important questions"]
        : examKey === "gate"
          ? ["concept", "PYQ", "numericals", "full playlist"]
          : examKey === "placement"
            ? ["interview questions", "practice", "coding pattern"]
            : ["one shot", "expected questions", "solved examples"];

    return [...terms, ...weakTerms.slice(0, 2)].map((modifier) => ({
      topic,
      query: [base, modifier, language].filter(Boolean).join(" "),
      intent: modifier,
      examKey,
    }));
  });
}

function buildCandidates(queryPlans, preferences) {
  return queryPlans.flatMap((plan, index) => {
    const titleBase = makeTitle(plan.query);
    const examSpecific = titleBase.includes("GATE") || titleBase.includes("PYQ");
    const language = languageTerm(preferences.language);
    const duration = estimateDuration(plan.intent, preferences);
    return [
      {
        id: `yt-video-${index}`,
        title: titleBase,
        channel: pickChannel(plan, index),
        url: youtubeSearchUrl(plan.query),
        thumbnail_url: `https://img.youtube.com/vi/search-${index}/hqdefault.jpg`,
        type: "video",
        duration,
        difficulty: inferDifficulty(preferences, plan.topic),
        teaching_style: inferTeachingStyle(plan.intent, preferences),
        language: language || "English",
        query: plan.query,
        metadata: {
          views: null,
          likes: null,
          transcript_available: "unknown until yt-dlp/transcript step",
          source: "youtube-search-url",
        },
        signals: makeSignals(plan, preferences, examSpecific),
      },
      {
        id: `yt-playlist-${index}`,
        title: `${titleBase} complete learning path`,
        channel: pickChannel(plan, index + 3),
        url: youtubeSearchUrl(`${plan.query} playlist`),
        type: "playlist",
        duration: preferences.study_time_minutes <= 90 ? "60-120 mins" : "6-12 hours",
        difficulty: inferDifficulty(preferences, plan.topic),
        teaching_style: preferences.study_time_minutes <= 90 ? "Fast Revision" : "Deep Concept",
        language: language || "English",
        query: `${plan.query} playlist`,
        metadata: {
          playlist_completeness: "estimated from query intent; verify via yt-dlp extraction",
          source: "youtube-search-url",
        },
        signals: makeSignals({ ...plan, intent: `${plan.intent} playlist` }, preferences, true),
      },
    ];
  });
}

function rankCandidates(candidates, preferences) {
  return candidates
    .map((candidate) => {
      const scoreParts = scoreCandidate(candidate, preferences);
      const score = Object.entries(scoreParts).reduce(
        (sum, [key, value]) => sum + value * SCORE_WEIGHTS[key],
        0,
      );
      return {
        ...candidate,
        score: Math.round(score),
        confidence: Math.round((scoreParts.topic_relevance + scoreParts.exam_specificity) / 2),
        score_breakdown: scoreParts,
        reason: buildReason(candidate, scoreParts),
        ranking_basis: buildRankingBasis(candidate, scoreParts),
        estimated_study_time: candidate.duration,
      };
    })
    .sort((a, b) => b.score - a.score)
    .filter((item, index, items) => items.findIndex((other) => other.title === item.title) === index);
}

const SCORE_WEIGHTS = {
  topic_relevance: 0.3,
  exam_specificity: 0.2,
  transcript_quality: 0.15,
  engagement_quality: 0.1,
  channel_credibility: 0.1,
  watchability: 0.05,
  pyq_coverage: 0.05,
  teaching_style_match: 0.05,
};

function scoreCandidate(candidate, preferences) {
  const value = `${candidate.title} ${candidate.query} ${candidate.channel}`.toLowerCase();
  const channelKnown = KNOWN_EDU_CHANNELS.some((channel) => value.includes(channel));
  return {
    topic_relevance: clampScore(candidate.signals.topic_relevance),
    exam_specificity: clampScore(candidate.signals.exam_specificity),
    transcript_quality: clampScore(candidate.signals.transcript_quality),
    engagement_quality: clampScore(channelKnown ? 80 : 65),
    channel_credibility: clampScore(channelKnown ? 88 : 68),
    watchability: clampScore(candidate.type === "playlist" ? 78 : 72),
    pyq_coverage: clampScore(value.includes("pyq") || value.includes("previous") ? 92 : 55),
    teaching_style_match: clampScore(styleMatch(candidate.teaching_style, preferences)),
  };
}

function makeSignals(plan, preferences, examSpecific) {
  const value = `${plan.query} ${plan.intent}`.toLowerCase();
  return {
    topic_relevance: 80 + Math.min(15, plan.topic.keywords.length * 2 + plan.topic.subtopics.length),
    exam_specificity: examSpecific || EXAM_TERMS[plan.examKey].some((term) => value.includes(term)) ? 92 : 68,
    transcript_quality:
      value.includes("concept") || value.includes("solved") || value.includes("full") ? 82 : 70,
    pyq_coverage: value.includes("pyq") || value.includes("previous") ? 95 : 55,
    clickbait_risk: /secret|guaranteed|100%|hack/i.test(value) ? 35 : 8,
    time_fit: preferences.study_time_minutes <= 90 && value.includes("full") ? 52 : 82,
  };
}

function buildReason(candidate, scoreParts) {
  const strengths = [];
  if (scoreParts.exam_specificity >= 85) strengths.push("strong exam-specific wording");
  if (scoreParts.pyq_coverage >= 85) strengths.push("PYQ/practice intent");
  if (scoreParts.channel_credibility >= 80) strengths.push("credible education-channel pattern");
  if (scoreParts.teaching_style_match >= 80) strengths.push("matches preferred teaching style");
  if (candidate.type === "playlist") strengths.push("structured playlist path");
  return `Ranked for ${strengths.slice(0, 3).join(", ") || "topic relevance and watchability"}. This rank is a weighted mix, not views-only.`;
}

function buildRankingBasis(candidate, scoreParts) {
  return [
    `Topic relevance ${scoreParts.topic_relevance}/100 weighted at 30%.`,
    `Exam specificity ${scoreParts.exam_specificity}/100 weighted at 20%.`,
    `Transcript/educational-density estimate ${scoreParts.transcript_quality}/100 weighted at 15%.`,
    `Engagement estimate ${scoreParts.engagement_quality}/100 weighted at 10%; likes/comments can replace this after yt-dlp metadata is enabled.`,
    `Channel credibility ${scoreParts.channel_credibility}/100 weighted at 10%.`,
    `Watchability, PYQ coverage, and teaching-style match together decide the remaining 15%.`,
    candidate.type === "playlist"
      ? "Playlist gets extra practical value when the query suggests a complete structured path."
      : "Video gets practical value when the query matches the user's available time and preparation mode.",
  ].join(" ");
}

function buildBestPicks(videos, playlists) {
  return {
    best_video_under_20_mins: videos.find((video) => /10-20|15-25/.test(video.duration)) || videos[0] || null,
    best_deep_explanation: videos.find((video) => video.teaching_style === "Deep Concept") || videos[0] || null,
    best_revision_lecture: videos.find((video) => video.teaching_style === "Fast Revision") || videos[0] || null,
    top_pyq_playlist: playlists.find((playlist) => playlist.query.toLowerCase().includes("pyq")) || playlists[0] || null,
    most_beginner_friendly:
      videos.find((video) => video.teaching_style === "Beginner Friendly") || videos[0] || null,
  };
}

function buildLearningPath(topics, preferences) {
  return topics.map((topic, index) => ({
    step: index + 1,
    topic: topic.topic,
    subject: topic.subject,
    target: preferences.study_time_minutes <= 90 ? "revision + expected questions" : "concept + examples + PYQ",
    youtube_query: youtubeSearchUrl(
      `${preferences.exam_type} ${topic.subject} ${topic.topic} ${preferences.study_time_minutes <= 90 ? "one shot revision" : "concept PYQ full playlist"} ${languageTerm(preferences.language)}`,
    ),
  }));
}

function getExamKey(examType) {
  if (examType.includes("gate")) return "gate";
  if (examType.includes("semester") || examType.includes("university")) return "semester";
  if (examType.includes("placement")) return "placement";
  return "competitive";
}

function inferTeachingStyle(intent, preferences) {
  const value = `${intent} ${preferences.teaching_style} ${preferences.mode}`.toLowerCase();
  if (value.includes("revision") || value.includes("one shot")) return "Fast Revision";
  if (value.includes("pyq") || value.includes("problem") || value.includes("numerical")) return "Problem Solving";
  if (value.includes("deep") || value.includes("concept") || value.includes("full")) return "Deep Concept";
  if (preferences.level.includes("beginner")) return "Beginner Friendly";
  return "Exam-Oriented";
}

function inferDifficulty(preferences, topic) {
  if (preferences.level.includes("beginner")) return topic.difficulty === "hard" ? "Intermediate" : "Beginner";
  if (preferences.mode.includes("deep")) return "Advanced";
  return "Intermediate";
}

function estimateDuration(intent, preferences) {
  const value = String(intent).toLowerCase();
  if (preferences.prefer_short || preferences.study_time_minutes <= 45) return "10-20 mins";
  if (value.includes("one shot") || value.includes("revision")) return "25-60 mins";
  if (value.includes("full") || value.includes("playlist")) return "2-8 hours";
  return "30-50 mins";
}

function styleMatch(style, preferences) {
  const preferred = preferences.teaching_style;
  const normalized = String(style).toLowerCase();
  if (preferred.includes("beginner") && normalized.includes("beginner")) return 92;
  if (preferred.includes("fast") && normalized.includes("revision")) return 90;
  if (preferred.includes("deep") && normalized.includes("deep")) return 90;
  if (preferred.includes("problem") && normalized.includes("problem")) return 88;
  return 74;
}

function pickChannel(plan, index) {
  const examKey = plan.examKey;
  const pools = {
    gate: ["Gate Smashers", "Made Easy", "Knowledge Gate", "Neso Academy"],
    semester: ["Gate Smashers", "Jenny's Lectures", "Neso Academy", "Easy Engineering Classes"],
    placement: ["take U forward", "Apna College", "CodeHelp", "GeeksforGeeks"],
    competitive: ["Unacademy", "BYJU'S Exam Prep", "Gate Smashers", "Neso Academy"],
  };
  const pool = pools[examKey] || pools.competitive;
  return pool[index % pool.length];
}

function makeTitle(query) {
  return query
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function languageTerm(language) {
  if (language.includes("hindi") && language.includes("english")) return "Hindi English";
  if (language.includes("hindi")) return "Hindi";
  if (language.includes("english")) return "English";
  return "";
}

function youtubeSearchUrl(query) {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
}

function clampScore(value) {
  return Math.max(0, Math.min(100, Math.round(Number(value || 0))));
}
