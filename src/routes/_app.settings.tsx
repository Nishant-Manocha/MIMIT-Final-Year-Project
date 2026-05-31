import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/_app/settings")({
  head: () => ({ meta: [{ title: "Settings — AdaptiveAI" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: settings } = useQuery({
    queryKey: ["settings", user?.id],
    enabled: !!user?.id,
    queryFn: api.settings,
  });
  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user?.id,
    queryFn: api.profile,
  });

  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  useEffect(() => {
    if (profile) {
      setName(profile.display_name ?? "");
      setBio(profile.bio ?? "");
    }
  }, [profile]);

  const saveProfile = useMutation({
    mutationFn: async () => {
      await api.updateProfile({ display_name: name, bio });
    },
    onSuccess: () => {
      toast.success("Profile saved");
      qc.invalidateQueries({ queryKey: ["profile"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const updateSetting = useMutation({
    mutationFn: async (patch: Record<string, any>) => {
      await api.updateSettings(patch);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["settings"] }),
  });

  function applyTheme(theme: "dark" | "light") {
    const root = document.documentElement;
    root.classList.remove("dark", "light");
    root.classList.add(theme);
    updateSetting.mutate({ theme });
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold md:text-4xl">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Tweak your profile, theme, and preferences.
        </p>
      </div>

      <Section title="Profile">
        <div className="space-y-4">
          <Field label="Display name" value={name} onChange={setName} />
          <Field label="Bio" value={bio} onChange={setBio} textarea />
          <button
            onClick={() => saveProfile.mutate()}
            disabled={saveProfile.isPending}
            className="rounded-lg bg-gradient-primary px-4 py-2 text-sm font-semibold text-primary-foreground glow-sm disabled:opacity-60"
          >
            {saveProfile.isPending ? "Saving…" : "Save changes"}
          </button>
        </div>
      </Section>

      <Section title="Appearance">
        <div className="flex gap-2">
          {(["dark", "light"] as const).map((t) => (
            <button
              key={t}
              onClick={() => applyTheme(t)}
              className={`rounded-lg px-4 py-2 text-sm capitalize ${settings?.theme === t ? "bg-gradient-primary text-primary-foreground" : "glass"}`}
            >
              {t}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Preferences">
        <Toggle
          label="Reduced motion"
          checked={!!settings?.reduced_motion}
          onChange={(v) => updateSetting.mutate({ reduced_motion: v })}
        />
        <Toggle
          label="Compact mode"
          checked={!!settings?.compact_mode}
          onChange={(v) => updateSetting.mutate({ compact_mode: v })}
        />
        <Toggle
          label="In-app notifications"
          checked={settings?.notifications_inapp ?? true}
          onChange={(v) => updateSetting.mutate({ notifications_inapp: v })}
        />
        <Toggle
          label="Email notifications"
          checked={settings?.notifications_email ?? true}
          onChange={(v) => updateSetting.mutate({ notifications_email: v })}
        />
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="glass gradient-border rounded-2xl p-6">
      <h2 className="font-display text-lg font-semibold">{title}</h2>
      <div className="mt-4 space-y-3">{children}</div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  textarea,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  textarea?: boolean;
}) {
  const cls =
    "w-full rounded-lg border border-border bg-background/40 px-3.5 py-2.5 text-sm outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/40";
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-muted-foreground">{label}</span>
      {textarea ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          className={cls}
        />
      ) : (
        <input value={value} onChange={(e) => onChange(e.target.value)} className={cls} />
      )}
    </label>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg glass-strong px-4 py-3">
      <span className="text-sm">{label}</span>
      <button
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 rounded-full transition ${checked ? "bg-gradient-primary" : "bg-muted"}`}
        role="switch"
        aria-checked={checked}
        aria-label={label}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition ${checked ? "left-[22px]" : "left-0.5"}`}
        />
      </button>
    </div>
  );
}
