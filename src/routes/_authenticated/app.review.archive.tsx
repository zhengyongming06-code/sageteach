import { createFileRoute, Navigate } from "@tanstack/react-router";

/** Legacy URL — review tasks live on Today (#archive). */
export const Route = createFileRoute("/_authenticated/app/review/archive")({
  component: ReviewArchiveRedirect,
});

function ReviewArchiveRedirect() {
  return <Navigate to="/app/today" hash="archive" replace />;
}
