import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import { Bell, Check } from "lucide-react";

export const Route = createFileRoute("/_app/notifications")({
  head: () => ({ meta: [{ title: "Notifications — AdaptiveAI" }] }),
  component: NotificationsPage,
});

function NotificationsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: notifs = [] } = useQuery({
    queryKey: ["notifications", user?.id],
    enabled: !!user?.id,
    queryFn: api.notifications,
  });

  const markRead = useMutation({
    mutationFn: async (id: string) => {
      await api.markNotificationRead(id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold md:text-4xl">Notifications</h1>
        <p className="mt-1 text-sm text-muted-foreground">Updates from your learning journey.</p>
      </div>
      {notifs.length === 0 ? (
        <div className="glass gradient-border grid place-items-center rounded-2xl p-12 text-center">
          <Bell className="h-10 w-10 text-muted-foreground/40" />
          <p className="mt-3 text-sm text-muted-foreground">You're all caught up.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifs.map((n: any) => (
            <div
              key={n.id}
              className={`glass flex items-start gap-3 rounded-xl p-4 ${!n.read ? "ring-1 ring-primary/40" : ""}`}
            >
              <div
                className={`mt-0.5 grid h-8 w-8 place-items-center rounded-lg ${n.read ? "bg-muted" : "bg-gradient-primary/30"}`}
              >
                <Bell className="h-3.5 w-3.5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold">{n.title}</div>
                {n.body && <div className="text-xs text-muted-foreground">{n.body}</div>}
                <div className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                  {new Date(n.created_at).toLocaleString()}
                </div>
              </div>
              {!n.read && (
                <button
                  onClick={() => markRead.mutate(n.id)}
                  className="rounded-md p-1.5 hover:bg-muted"
                  aria-label="Mark as read"
                >
                  <Check className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
