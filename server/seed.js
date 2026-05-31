import { Chapter, Course, Question, Quiz } from "./models.js";

const gatePyqSubjects = [
  {
    subject: "DBMS",
    topic: "dbms",
    templates: [
      ["Which property of transactions ensures all-or-nothing execution?", ["Isolation", "Atomicity", "Durability", "Indexing"], 1, "Atomicity guarantees that a transaction either commits completely or has no effect."],
      ["Which normal form removes partial dependency on a candidate key?", ["1NF", "2NF", "3NF", "BCNF"], 1, "2NF removes partial dependency of non-prime attributes on a proper subset of a candidate key."],
      ["A schedule is conflict-serializable when its precedence graph is:", ["Disconnected", "Acyclic", "Complete", "Cyclic"], 1, "A schedule is conflict-serializable iff its precedence graph has no cycle."],
      ["Which index structure is commonly used for range queries?", ["Hash index", "B+ tree", "Bitmap only", "Stack"], 1, "B+ trees keep keys sorted and support efficient range scans."],
    ],
  },
  {
    subject: "Computer Organization and Architecture",
    topic: "coa",
    templates: [
      ["In a 5-stage ideal pipeline, the ideal CPI is:", ["0", "1", "5", "Depends only on clock"], 1, "After the pipeline fills, ideally one instruction completes per cycle."],
      ["Cache locality that reuses recently accessed data is called:", ["Spatial locality", "Temporal locality", "Address locality", "Random locality"], 1, "Temporal locality means recently used items are likely to be used again."],
      ["A direct-mapped cache maps each memory block to:", ["Any cache line", "Exactly one cache line", "Two cache lines", "Only main memory"], 1, "In direct mapping, block number modulo number of cache lines gives one possible line."],
      ["Which hazard occurs when an instruction depends on a previous instruction's result?", ["Control hazard", "Data hazard", "Structural hazard", "Page fault"], 1, "A data hazard occurs because data needed by an instruction is not ready yet."],
    ],
  },
  {
    subject: "Operating Systems",
    topic: "operating-systems",
    templates: [
      ["Which scheduling algorithm may cause starvation?", ["FCFS", "Round Robin", "Shortest Job First", "FIFO"], 2, "Shorter jobs can keep arriving and delay longer jobs indefinitely in SJF."],
      ["Thrashing is mainly due to:", ["Excessive paging", "Compiler error", "DNS failure", "Too many registers"], 0, "Thrashing happens when the system spends most time swapping pages."],
      ["A semaphore is primarily used for:", ["Synchronization", "Compilation", "Routing", "Lexical analysis"], 0, "Semaphores coordinate access to shared resources and critical sections."],
      ["Circular wait is associated with:", ["Deadlock", "Segmentation", "Hashing", "Normalization"], 0, "Circular wait is one of the Coffman necessary conditions for deadlock."],
    ],
  },
  {
    subject: "Computer Networks",
    topic: "computer-networks",
    templates: [
      ["Which transport protocol provides reliable byte-stream service?", ["UDP", "TCP", "IP", "ARP"], 1, "TCP provides reliable, ordered, byte-stream delivery."],
      ["IPv4 address length is:", ["16 bits", "32 bits", "64 bits", "128 bits"], 1, "IPv4 addresses are 32-bit values."],
      ["During TCP slow start, congestion window grows approximately:", ["Linearly", "Exponentially per RTT", "Constantly", "Randomly"], 1, "In slow start, cwnd roughly doubles every RTT."],
      ["Which layer is responsible for routing packets across networks?", ["Application", "Transport", "Network", "Physical"], 2, "The network layer handles logical addressing and routing."],
    ],
  },
  {
    subject: "Algorithms",
    topic: "algorithms",
    templates: [
      ["Dijkstra's algorithm with a binary heap runs in:", ["O(V^2)", "O(E log V)", "O(VE)", "O(log V)"], 1, "Binary heap implementation gives O((V+E) log V), commonly O(E log V) for connected graphs."],
      ["Which technique solves overlapping subproblems efficiently?", ["Dynamic programming", "Backtracking only", "Lexing", "Randomization only"], 0, "Dynamic programming stores solutions to overlapping subproblems."],
      ["The recurrence T(n)=2T(n/2)+O(n) solves to:", ["O(n)", "O(n log n)", "O(n^2)", "O(log n)"], 1, "By Master theorem, a=b=2 and f(n)=n, so T(n)=O(n log n)."],
      ["Which data structure is typically used in Prim's MST algorithm?", ["Stack", "Queue", "Min-priority queue", "Trie"], 2, "A min-priority queue selects the next minimum edge efficiently."],
    ],
  },
  {
    subject: "Data Structures",
    topic: "data-structures",
    templates: [
      ["Inorder traversal of a BST outputs keys in:", ["Insertion order", "Sorted order", "Reverse level order", "Random order"], 1, "BST inorder traversal visits left subtree, root, right subtree, giving sorted keys."],
      ["Which data structure is used for balanced parentheses checking?", ["Queue", "Stack", "Heap", "Graph"], 1, "A stack matches the most recent unmatched opening bracket."],
      ["A full binary tree with L leaves has internal nodes:", ["L", "L-1", "2L", "L+1"], 1, "For a full binary tree, leaves = internal nodes + 1."],
      ["Heap sort worst-case time complexity is:", ["O(n)", "O(n log n)", "O(n^2)", "O(log n)"], 1, "Building heap and repeated extract operations take O(n log n)."],
    ],
  },
  {
    subject: "Theory of Computation",
    topic: "toc",
    templates: [
      ["The language {a^n b^n | n >= 0} is:", ["Regular", "Context-free but not regular", "Not context-free", "Finite"], 1, "It needs stack memory to match counts, so it is CFL but not regular."],
      ["A DFA recognizes exactly the class of:", ["Regular languages", "Context-sensitive languages", "All languages", "Only finite languages"], 0, "DFAs recognize regular languages."],
      ["Which grammar type generates context-free languages?", ["Type 0", "Type 1", "Type 2", "Type 3 only"], 2, "In the Chomsky hierarchy, Type 2 grammars are context-free grammars."],
      ["Pumping lemma for regular languages is used to prove:", ["A language is not regular", "A DFA is minimal", "A grammar is ambiguous", "A parse tree is unique"], 0, "It is commonly used by contradiction to show non-regularity."],
    ],
  },
  {
    subject: "Compiler Design",
    topic: "compiler-design",
    templates: [
      ["Which parsing technique is bottom-up?", ["Recursive descent", "Predictive parsing", "LR parsing", "LL(1) parsing"], 2, "LR parsers build the parse tree from leaves toward the root."],
      ["Lexical analysis converts source code into:", ["Tokens", "Parse trees", "Machine code only", "Basic blocks"], 0, "The lexer groups character streams into tokens."],
      ["FIRST and FOLLOW sets are used in:", ["Parsing", "Register allocation", "Paging", "Routing"], 0, "FIRST and FOLLOW guide parser construction and predictive parsing decisions."],
      ["A syntax tree is mainly produced during:", ["Parsing", "Linking", "Loading", "Scheduling"], 0, "Syntax analysis/parsing builds parse or syntax trees."],
    ],
  },
  {
    subject: "Digital Logic",
    topic: "digital-logic",
    templates: [
      ["A flip-flop stores:", ["One bit", "One byte", "One instruction", "One packet"], 0, "A flip-flop is a bistable storage element for one bit."],
      ["The 2's complement of 4-bit 0011 represents negative:", ["1", "3", "13", "0"], 1, "0011 is +3; its 2's complement represents -3."],
      ["Which gate alone is functionally complete?", ["XOR", "NAND", "Buffer", "XNOR only"], 1, "NAND can implement NOT, AND, OR and hence any Boolean function."],
      ["A multiplexer is used to:", ["Select one input among many", "Store one bit", "Add binary numbers only", "Decode addresses only"], 0, "A mux forwards one selected input to the output."],
    ],
  },
  {
    subject: "Engineering Mathematics",
    topic: "engineering-mathematics",
    templates: [
      ["If a 3x3 matrix has eigenvalues 1, 2, and 3, its determinant is:", [], 6, "The determinant equals the product of eigenvalues: 1 x 2 x 3 = 6.", "nat"],
      ["The rank of a matrix with all rows multiples of a non-zero row is:", [], 1, "All rows lie in the span of one non-zero row, so rank is 1.", "nat"],
      ["For independent events A and B, P(A ∩ B) equals:", ["P(A)+P(B)", "P(A)P(B)", "P(A)-P(B)", "1"], 1, "Independence gives P(A intersection B)=P(A)P(B)."],
      ["The number of edges in a tree with n vertices is:", ["n", "n-1", "n+1", "2n"], 1, "Every tree with n vertices has exactly n-1 edges."],
    ],
  },
];

const digitalLogicDiagram =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="520" height="220" viewBox="0 0 520 220">
      <rect width="520" height="220" rx="16" fill="#fbfaf5"/>
      <g stroke="#5b57d6" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round">
        <path d="M80 55h70"/>
        <path d="M80 145h70"/>
        <path d="M150 40h95c48 0 88 39 88 88s-40 88-88 88h-95c32-42 32-134 0-176z"/>
        <path d="M333 128h76"/>
      </g>
      <text x="58" y="60" font-family="Arial" font-size="24" fill="#111827">A</text>
      <text x="58" y="152" font-family="Arial" font-size="24" fill="#111827">B</text>
      <text x="422" y="136" font-family="Arial" font-size="24" fill="#111827">Y</text>
      <text x="180" y="128" font-family="Arial" font-size="22" fill="#5b57d6">OR</text>
    </svg>`,
  );

function generateGatePyqArchiveQuestions() {
  const years = Array.from({ length: 10 }, (_, index) => 2025 - index);
  const questions = [];
  for (const year of years) {
    for (const subject of gatePyqSubjects) {
      subject.templates.forEach((template, templateIndex) => {
        const [text, options, answer, explanation, forcedType] = template;
        questions.push([
          `[GATE CSE ${year}] ${text}`,
          options,
          answer,
          explanation,
          subject.topic,
          templateIndex % 3 === 0 ? "hard" : templateIndex % 3 === 1 ? "medium" : "easy",
          forcedType,
          subject.subject,
          year,
          templateIndex + 1,
          subject.subject === "Digital Logic" && templateIndex === 3 ? digitalLogicDiagram : undefined,
          subject.subject === "Digital Logic" && templateIndex === 3 ? "Two-input OR gate diagram" : undefined,
        ]);
      });
    }
  }
  return questions;
}

const examTracks = [
  {
    title: "TCS NQT Placement Masterclass",
    slug: "tcs-nqt-placement-masterclass",
    description:
      "A complete TCS NQT prep path with aptitude, verbal ability, reasoning, coding logic, and interview readiness.",
    thumbnail_url:
      "https://images.unsplash.com/photo-1551836022-d5d88e9218df?auto=format&fit=crop&w=1200&q=80",
    instructor_name: "Placement Prep Faculty",
    difficulty: "intermediate",
    category: "Placement Exams",
    tags: ["tcs", "nqt", "aptitude", "reasoning", "verbal", "coding", "placement"],
    duration_minutes: 780,
    rating: 4.8,
    enrolled_count: 18420,
    chapters: [
      [
        "TCS NQT pattern and strategy",
        "Foundation, scoring areas, time planning, and section order.",
        2100,
      ],
      [
        "Quantitative aptitude",
        "Numbers, percentages, profit-loss, time-work, speed-distance, and averages.",
        5400,
      ],
      [
        "Logical reasoning",
        "Series, arrangements, syllogisms, coding-decoding, clocks, calendars, and puzzles.",
        4800,
      ],
      [
        "Verbal ability",
        "Grammar, reading comprehension, sentence correction, para jumbles, and vocabulary.",
        3600,
      ],
      [
        "Programming logic and coding",
        "Loops, arrays, strings, recursion basics, debugging, and common coding rounds.",
        6000,
      ],
    ],
    quiz: {
      title: "TCS NQT Demo Practice Set",
      description: "Placement-style aptitude, reasoning, verbal, and coding questions.",
      topic: "tcs-nqt",
      difficulty: "medium",
      time_limit_seconds: 1500,
      questions: [
        [
          "A number is increased by 20% and then decreased by 20%. What is the net change?",
          ["No change", "4% increase", "4% decrease", "8% decrease"],
          2,
          "Successive percentage changes multiply: 1.2 x 0.8 = 0.96, so the result is 4% less.",
          "percentages",
          "easy",
        ],
        [
          "Find the next term: 3, 8, 18, 38, 78, ?",
          ["148", "158", "168", "178"],
          1,
          "Each term is doubled and 2 is added: 3x2+2=8, 8x2+2=18, so 78x2+2=158.",
          "series",
          "easy",
        ],
        [
          "Choose the grammatically correct sentence.",
          [
            "Each of the students have submitted their forms.",
            "Each of the students has submitted the form.",
            "Each students has submitted their form.",
            "Each of student have submitted forms.",
          ],
          1,
          "Each is singular, so it takes has.",
          "grammar",
          "medium",
        ],
        [
          "Which data structure is most suitable for checking balanced parentheses?",
          ["Queue", "Stack", "Hash table", "Heap"],
          1,
          "A stack supports last-in, first-out matching, exactly what nested brackets need.",
          "coding",
          "medium",
        ],
        [
          "Two pipes fill a tank in 12 and 18 minutes. How long will they take together?",
          ["6.2 minutes", "7.2 minutes", "8.4 minutes", "9 minutes"],
          1,
          "Combined rate is 1/12 + 1/18 = 5/36 tank per minute, so time is 36/5 = 7.2 minutes.",
          "time-work",
          "hard",
        ],
      ],
    },
  },
  {
    title: "Infosys Placement Prep",
    slug: "infosys-placement-prep",
    description:
      "Prepare for Infosys online assessment, pseudo-code, puzzle reasoning, communication, and specialist interview rounds.",
    thumbnail_url:
      "https://images.unsplash.com/photo-1497366811353-6870744d04b2?auto=format&fit=crop&w=1200&q=80",
    instructor_name: "Campus Hiring Mentors",
    difficulty: "intermediate",
    category: "Placement Exams",
    tags: ["infosys", "infytq", "aptitude", "pseudocode", "logical", "interview"],
    duration_minutes: 720,
    rating: 4.7,
    enrolled_count: 13200,
    chapters: [
      [
        "Infosys exam blueprint",
        "Round-wise pattern, cutoffs, role expectations, and preparation calendar.",
        1800,
      ],
      [
        "Mathematical ability",
        "Ratio, probability, permutation-combination, algebra, geometry, and DI.",
        4800,
      ],
      [
        "Analytical puzzle solving",
        "Seating arrangement, blood relation, directions, cubes, and data sufficiency.",
        4500,
      ],
      [
        "Pseudo-code and programming",
        "Trace loops, functions, arrays, strings, complexity, and output prediction.",
        5400,
      ],
      [
        "HR and technical interview",
        "Project explanation, OOP, DBMS, operating systems, and communication drills.",
        3600,
      ],
    ],
    quiz: {
      title: "Infosys Demo Assessment",
      description: "A short Infosys-style test covering aptitude, puzzles, and pseudo-code.",
      topic: "infosys",
      difficulty: "medium",
      time_limit_seconds: 1500,
      questions: [
        [
          "If P(A)=0.5, P(B)=0.4, and P(A and B)=0.2, what is P(A or B)?",
          ["0.5", "0.7", "0.9", "1.1"],
          1,
          "Use P(A union B)=P(A)+P(B)-P(A intersection B)=0.5+0.4-0.2=0.7.",
          "probability",
          "easy",
        ],
        [
          "In pseudo-code, what does a loop from i=1 to n usually contribute to time complexity?",
          ["O(1)", "O(log n)", "O(n)", "O(n^2)"],
          2,
          "A single loop that scales linearly with n performs proportional work.",
          "complexity",
          "easy",
        ],
        [
          "A, B, C, D sit in a row. A is left of B, C is right of D, and D is left of A. Which one must be true?",
          ["D is left of B", "C is left of A", "B is left of D", "A is right of C"],
          0,
          "The constraints give D < A < B and D < C, so D is definitely left of B.",
          "arrangements",
          "medium",
        ],
        [
          "Which OOP concept lets one interface have many implementations?",
          ["Encapsulation", "Polymorphism", "Abstraction only", "Compilation"],
          1,
          "Polymorphism allows the same call/interface to behave differently for different implementations.",
          "oop",
          "medium",
        ],
        [
          "A shopkeeper marks an item 25% above cost and gives 10% discount. What is the profit percentage?",
          ["10%", "12.5%", "15%", "20%"],
          1,
          "Selling price is 1.25 x 0.9 = 1.125 times cost, so profit is 12.5%.",
          "profit-loss",
          "hard",
        ],
      ],
    },
  },
  {
    title: "Mass Recruiter Aptitude Pack",
    slug: "mass-recruiter-aptitude-pack",
    description:
      "One prep track for Wipro, Accenture, Cognizant, Capgemini, HCL, Tech Mahindra, and similar campus drives.",
    thumbnail_url:
      "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=1200&q=80",
    instructor_name: "Corporate Readiness Team",
    difficulty: "beginner",
    category: "Placement Exams",
    tags: ["wipro", "accenture", "cognizant", "capgemini", "aptitude", "coding", "communication"],
    duration_minutes: 660,
    rating: 4.6,
    enrolled_count: 22100,
    chapters: [
      [
        "Hiring patterns across companies",
        "Common rounds, time limits, elimination stages, and role fit.",
        1500,
      ],
      [
        "Core aptitude sprint",
        "Percentages, SI-CI, time-speed-distance, mixtures, averages, and number systems.",
        5100,
      ],
      [
        "Reasoning sprint",
        "Verbal and non-verbal reasoning, puzzles, series, and statement conclusions.",
        4500,
      ],
      ["Coding basics", "Input-output, arrays, strings, sorting, searching, and edge cases.", 5400],
      [
        "Communication and email writing",
        "Business writing, grammar, spoken interview answers, and group discussion.",
        3000,
      ],
    ],
    quiz: {
      title: "Mass Recruiter Mixed Demo",
      description: "A balanced practice set for common campus hiring rounds.",
      topic: "mass-recruiter",
      difficulty: "easy",
      time_limit_seconds: 1200,
      questions: [
        [
          "What is 35% of 240?",
          ["72", "78", "84", "96"],
          2,
          "10% is 24, 30% is 72, and 5% is 12. Total is 84.",
          "percentages",
          "easy",
        ],
        [
          "Which sorting algorithm has average time complexity O(n log n)?",
          ["Bubble sort", "Insertion sort", "Merge sort", "Linear search"],
          2,
          "Merge sort divides the array and merges sorted halves, giving O(n log n).",
          "sorting",
          "medium",
        ],
        [
          "Complete the analogy: Book : Author :: Song : ?",
          ["Singer", "Composer", "Page", "Stage"],
          1,
          "An author creates a book; a composer creates a song.",
          "analogy",
          "easy",
        ],
        [
          "Which sentence is best for a professional email opening?",
          [
            "Hey, I need this now.",
            "Respected Sir/Madam, I am writing to request an update.",
            "Send it fast.",
            "What happened?",
          ],
          1,
          "It is polite, specific, and professional.",
          "communication",
          "easy",
        ],
        [
          "A train of length 120 m crosses a pole in 6 seconds. What is its speed?",
          ["20 m/s", "24 m/s", "30 m/s", "36 m/s"],
          0,
          "Speed equals distance/time = 120/6 = 20 m/s.",
          "speed-distance",
          "medium",
        ],
      ],
    },
  },
  {
    title: "GATE CSE Complete Syllabus",
    slug: "gate-cse-complete-syllabus",
    description:
      "Structured GATE CS/IT preparation across engineering mathematics, programming, DSA, TOC, OS, DBMS, CN, COA, and aptitude.",
    thumbnail_url:
      "https://images.unsplash.com/photo-1519389950473-47ba0277781c?auto=format&fit=crop&w=1200&q=80",
    instructor_name: "GATE CS Faculty",
    difficulty: "advanced",
    category: "Technical Exams",
    tags: ["gate", "cse", "dsa", "os", "dbms", "toc", "computer-networks", "engineering-math"],
    duration_minutes: 2400,
    rating: 4.9,
    enrolled_count: 30500,
    chapters: [
      [
        "Engineering mathematics",
        "Discrete math, linear algebra, calculus basics, probability, and statistics.",
        9000,
      ],
      [
        "Programming and data structures",
        "C programming, recursion, arrays, linked lists, stacks, queues, trees, graphs.",
        12600,
      ],
      [
        "Algorithms",
        "Asymptotic analysis, sorting, searching, greedy, DP, graph algorithms, and hashing.",
        12000,
      ],
      [
        "Theory of computation and compiler design",
        "Automata, regular languages, CFG, parsing, lexical analysis, and syntax-directed translation.",
        10800,
      ],
      [
        "OS, DBMS, CN, and COA",
        "Processes, memory, transactions, SQL, protocols, pipelining, cache, and addressing.",
        14400,
      ],
    ],
    quiz: {
      title: "GATE CSE Demo Questions",
      description: "Conceptual and numerical demo questions from core GATE CS subjects.",
      topic: "gate-cse",
      difficulty: "hard",
      time_limit_seconds: 1800,
      questions: [
        [
          "For a binary search tree, inorder traversal outputs keys in which order?",
          ["Insertion order", "Sorted nondecreasing order", "Reverse level order", "Random order"],
          1,
          "Inorder traversal of a BST visits left subtree, root, then right subtree, producing sorted keys.",
          "trees",
          "easy",
        ],
        [
          "Which scheduling algorithm can cause starvation?",
          ["Round Robin", "FCFS", "Shortest Job First", "FIFO disk scheduling only"],
          2,
          "Short jobs may keep arriving and delay a long job indefinitely.",
          "operating-systems",
          "medium",
        ],
        [
          "The language {a^n b^n | n >= 0} is:",
          ["Regular", "Context-free but not regular", "Not context-free", "Only finite"],
          1,
          "It needs a stack-like memory to match counts, so it is context-free but not regular.",
          "toc",
          "medium",
        ],
        [
          "In a database, which property ensures a transaction is all-or-nothing?",
          ["Isolation", "Atomicity", "Durability", "Consistency"],
          1,
          "Atomicity means either every operation of a transaction commits or none of them do.",
          "dbms",
          "easy",
        ],
        [
          "Select all GATE topics where dynamic programming is commonly used.",
          [
            "Matrix-chain multiplication",
            "Longest common subsequence",
            "Dijkstra with negative edges",
            "0/1 knapsack",
          ],
          [0, 1, 3],
          "Matrix-chain multiplication, LCS, and 0/1 knapsack are classic dynamic programming problems.",
          "algorithms",
          "hard",
        ],
        [
          "A full binary tree has 31 nodes. How many internal nodes does it have?",
          [],
          15,
          "In a full binary tree, total nodes n = 2i + 1, where i is internal nodes. So i = (31 - 1) / 2 = 15.",
          "trees",
          "medium",
          "nat",
        ],
      ],
    },
  },
  {
    title: "GATE CSE Previous Year Practice",
    slug: "gate-cse-previous-year-practice",
    description:
      "A 10-year previous-year style GATE CSE practice track organized by year, with exam workspace, explanations, and review export.",
    thumbnail_url:
      "https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?auto=format&fit=crop&w=1200&q=80",
    instructor_name: "GATE PYQ Faculty",
    difficulty: "advanced",
    category: "Technical Exams",
    tags: ["gate", "cse", "previous-year", "pyq", "official-pattern", "workspace"],
    duration_minutes: 1800,
    rating: 4.9,
    enrolled_count: 27400,
    chapters: [
      ["GATE 2025 paper review", "Recent-paper style CS questions and solution review.", 3600],
      ["GATE 2024 paper review", "Core CS questions with workspace-first solving.", 3600],
      ["GATE 2023 paper review", "Algorithms, OS, DBMS, networks, and aptitude practice.", 3600],
      ["GATE 2022 paper review", "Topic-wise previous-year revision and common traps.", 3600],
      ["GATE 2021 to 2016 archive", "Long-range trend practice for the last decade.", 7200],
    ],
    quiz: {
      title: "GATE CSE Previous 10 Years PYQ Workspace",
      description:
        "Subject-wise GATE CSE previous-year practice archive across DBMS, COA, OS, CN, DSA, algorithms, TOC, compiler, digital logic, and mathematics.",
      topic: "gate-cse-pyq",
      difficulty: "hard",
      quiz_type: "previous-year",
      time_limit_seconds: 10800,
      questions: generateGatePyqArchiveQuestions(),
    },
  },
  {
    title: "ISRO Scientist/Engineer CS Prep",
    slug: "isro-scientist-engineer-cs-prep",
    description:
      "Focused ISRO CS preparation with previous-year style technical questions, computer science fundamentals, and exam strategy.",
    thumbnail_url:
      "https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?auto=format&fit=crop&w=1200&q=80",
    instructor_name: "Public Sector Exam Faculty",
    difficulty: "advanced",
    category: "Technical Exams",
    tags: [
      "isro",
      "scientist-engineer",
      "cse",
      "os",
      "networks",
      "digital-logic",
      "computer-architecture",
    ],
    duration_minutes: 1260,
    rating: 4.8,
    enrolled_count: 9800,
    chapters: [
      [
        "ISRO CS exam orientation",
        "Pattern, technical emphasis, speed strategy, and revision schedule.",
        1800,
      ],
      [
        "Digital logic and COA",
        "Boolean algebra, combinational circuits, sequential logic, cache, and pipelining.",
        7200,
      ],
      [
        "Operating systems and DBMS",
        "Process synchronization, deadlock, memory management, SQL, indexing, and normalization.",
        7800,
      ],
      [
        "Networks and software engineering",
        "OSI/TCP-IP, routing, congestion control, testing, SDLC, and design principles.",
        7200,
      ],
      [
        "Previous-year style drills",
        "High-speed mixed CS questions with explanations and elimination techniques.",
        6000,
      ],
    ],
    quiz: {
      title: "ISRO CS Technical Demo",
      description: "Fast technical questions matching ISRO-style CS fundamentals.",
      topic: "isro-cs",
      difficulty: "hard",
      time_limit_seconds: 1500,
      questions: [
        [
          "Which flip-flop is commonly used as a basic memory element?",
          ["JK only", "SR latch/flip-flop", "Multiplexer", "Decoder"],
          1,
          "A latch or flip-flop stores one bit and forms the base of sequential circuits.",
          "digital-logic",
          "easy",
        ],
        [
          "Thrashing in an operating system is mainly caused by:",
          ["Too much CPU cache", "Excessive paging", "Compiler errors", "Low disk capacity only"],
          1,
          "Thrashing occurs when the system spends most of its time swapping pages.",
          "operating-systems",
          "medium",
        ],
        [
          "Which protocol provides reliable byte-stream transport?",
          ["UDP", "IP", "TCP", "ARP"],
          2,
          "TCP provides reliable, ordered, byte-stream delivery.",
          "computer-networks",
          "easy",
        ],
        [
          "In software testing, white-box testing primarily uses:",
          [
            "Internal code structure",
            "Only user manuals",
            "Only UI screenshots",
            "Only customer surveys",
          ],
          0,
          "White-box testing designs cases using knowledge of internal code paths.",
          "software-engineering",
          "medium",
        ],
        [
          "A cache hit ratio increases when:",
          [
            "Locality of reference is strong",
            "All memory accesses are random",
            "Cache size is zero",
            "CPU clock is reduced",
          ],
          0,
          "Temporal and spatial locality make recently or nearby accessed data more likely to be reused.",
          "computer-architecture",
          "hard",
        ],
      ],
    },
  },
  {
    title: "BARC OCES/DGFS CS Prep",
    slug: "barc-oces-dgfs-cs-prep",
    description:
      "BARC computer science track for engineering graduates: core CS, numerical accuracy, speed, and interview foundation.",
    thumbnail_url:
      "https://images.unsplash.com/photo-1581092335878-2d9ff86ca2bf?auto=format&fit=crop&w=1200&q=80",
    instructor_name: "Govt Technical Exam Mentors",
    difficulty: "advanced",
    category: "Technical Exams",
    tags: ["barc", "oces", "dgfs", "cse", "algorithms", "dbms", "os", "networks"],
    duration_minutes: 1320,
    rating: 4.7,
    enrolled_count: 8600,
    chapters: [
      [
        "BARC exam strategy",
        "Syllabus mapping, scoring areas, time pressure, and interview pathway.",
        1800,
      ],
      [
        "Algorithms and data structures",
        "Trees, graphs, hashing, heaps, recurrence, greedy, dynamic programming.",
        7800,
      ],
      [
        "OS and DBMS deep revision",
        "Scheduling, synchronization, paging, SQL, transactions, serializability, indexing.",
        8400,
      ],
      [
        "Networks and architecture",
        "Addressing, routing, transport protocols, cache, memory hierarchy, and pipelining.",
        7200,
      ],
      [
        "Mixed technical practice",
        "Timed CS problems with conceptual explanations and shortcut checks.",
        6000,
      ],
    ],
    quiz: {
      title: "BARC CS Demo Test",
      description: "Mixed core CS questions for BARC OCES/DGFS preparation.",
      topic: "barc-cs",
      difficulty: "hard",
      time_limit_seconds: 1500,
      questions: [
        [
          "Which traversal of a binary search tree gives sorted keys?",
          ["Preorder", "Inorder", "Postorder", "Level order"],
          1,
          "Inorder traversal visits keys in sorted order for a BST.",
          "data-structures",
          "easy",
        ],
        [
          "A relation is in 3NF if it is in 2NF and has no:",
          [
            "Primary key",
            "Candidate key",
            "Transitive dependency of non-prime attributes",
            "Foreign key",
          ],
          2,
          "3NF removes transitive dependencies involving non-prime attributes.",
          "dbms",
          "medium",
        ],
        [
          "Which technique is used to handle mutual exclusion in critical sections?",
          ["Semaphore", "Compiler optimization", "DNS lookup", "Paging only"],
          0,
          "Semaphores and locks are classic synchronization tools for mutual exclusion.",
          "operating-systems",
          "medium",
        ],
        [
          "Which algorithm design technique solves overlapping subproblems?",
          ["Dynamic programming", "Random guessing", "Linear probing only", "Lexical analysis"],
          0,
          "Dynamic programming stores results of overlapping subproblems to avoid recomputation.",
          "algorithms",
          "hard",
        ],
        [
          "IPv4 address length is:",
          ["16 bits", "32 bits", "64 bits", "128 bits"],
          1,
          "IPv4 addresses are 32-bit values, commonly written in dotted decimal form.",
          "computer-networks",
          "easy",
        ],
      ],
    },
  },
];

export async function seedDemoContent() {
  for (const track of examTracks) {
    const course = await Course.findOneAndUpdate(
      { slug: track.slug },
      {
        $set: {
          title: track.title,
          description: track.description,
          thumbnail_url: track.thumbnail_url,
          instructor_name: track.instructor_name,
          difficulty: track.difficulty,
          category: track.category,
          tags: track.tags,
          duration_minutes: track.duration_minutes,
          rating: track.rating,
          enrolled_count: track.enrolled_count,
          published: true,
        },
      },
      { new: true, upsert: true },
    );

    await Chapter.deleteMany({ course_id: course._id });
    await Chapter.insertMany(
      track.chapters.map(([title, description, duration_seconds], index) => ({
        course_id: course._id,
        title,
        description,
        duration_seconds,
        order_index: index + 1,
      })),
    );

    const oldQuizzes = await Quiz.find({ course_id: course._id }).select("_id");
    await Question.deleteMany({ quiz_id: { $in: oldQuizzes.map((quiz) => quiz._id) } });
    await Quiz.deleteMany({ course_id: course._id });

    const quiz = await Quiz.create({
      course_id: course._id,
      title: track.quiz.title,
      description: track.quiz.description,
      quiz_type: track.quiz.quiz_type || (track.category === "Technical Exams" ? "mock" : "demo"),
      time_limit_seconds: track.quiz.time_limit_seconds,
      negative_marking: track.category === "Technical Exams" ? 0.66 : 0,
      topic: track.quiz.topic,
      difficulty: track.quiz.difficulty,
      published: true,
    });

    await Question.insertMany(
      track.quiz.questions.map(
        (
          [
            question_text,
            options,
            correct_answer,
            explanation,
            topic,
            difficulty,
            question_type,
            source_subject,
            source_year,
            source_question_number,
            image_url,
            image_alt,
          ],
          index,
        ) => ({
          quiz_id: quiz._id,
          question_text,
          question_type: question_type || (Array.isArray(correct_answer) ? "msq" : "mcq"),
          options,
          image_url,
          image_alt,
          correct_answer,
          explanation,
          subject: source_subject || (track.category === "Technical Exams" ? "Computer Science" : "Placement Prep"),
          topic,
          subtopic: topic,
          source_exam: track.quiz.quiz_type === "previous-year" ? "GATE CSE" : undefined,
          source_year,
          source_session: source_year ? "subject-wise archive" : undefined,
          source_question_number,
          source_url: source_year ? "https://gate2025.iitr.ac.in/" : undefined,
          difficulty,
          tags: [...track.tags.slice(0, 4), topic],
          solving_approaches: [
            `Direct method: identify the ${topic} concept and eliminate impossible choices.`,
            "Exam method: estimate quickly, mark doubtful steps in the workspace, then verify before final submission.",
          ],
          concept_notes: `This question belongs to ${topic}. Revise the linked syllabus module and retry similar questions after review.`,
          common_mistakes: [
            "Rushing without checking whether the question is MCQ, MSQ, or NAT.",
            "Skipping unit, boundary, or keyword checks under timer pressure.",
          ],
          embedding_text: `${track.title} ${track.category} ${topic} ${question_text} ${explanation}`,
          marks: difficulty === "hard" ? 2 : 1,
          order_index: index + 1,
        }),
      ),
    );
  }

  console.log(`[api] Seeded ${examTracks.length} exam-prep courses with demo questions`);
}
