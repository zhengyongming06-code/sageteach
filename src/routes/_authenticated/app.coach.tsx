import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/app/coach")({
  component: CoachRedirect,
});

function CoachRedirect() {
  return <Navigate to="/app/review" replace />;
}
