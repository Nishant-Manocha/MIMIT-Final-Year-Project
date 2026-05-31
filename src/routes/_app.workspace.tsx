import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/workspace")({
  component: WorkspaceRedirect,
});

function WorkspaceRedirect() {
  return <Navigate to="/quizzes" replace />;
}
