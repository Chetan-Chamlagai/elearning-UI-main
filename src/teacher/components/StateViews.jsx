// components/StateViews.jsx
import { AlertTriangle, Inbox, RefreshCw } from "lucide-react";
import "./StateViews.css";

/* ============================================================
 * EmptyState
 * Used when a list/grid has nothing to show (no lessons, no exams,
 * no enrolled courses, etc).
 *
 * Props:
 *  - icon         optional custom icon element, e.g. <BookOpen size={28} />
 *  - title        short headline, e.g. "No exams available."
 *  - message      one line of supporting copy
 *  - actionLabel  optional button text, e.g. "Browse Courses"
 *  - onAction     optional click handler for the button
 * ============================================================ */
export const EmptyState = ({ icon, title, message, actionLabel, onAction }) => (
  <div className="state-view state-view--empty">
    <div className="state-view__icon state-view__icon--empty">
      {icon || <Inbox size={26} />}
    </div>
    {title && <p className="state-view__title">{title}</p>}
    {message && <p className="state-view__message">{message}</p>}
    {actionLabel && onAction && (
      <button className="state-view__action" onClick={onAction}>
        {actionLabel}
      </button>
    )}
  </div>
);

/* ============================================================
 * ErrorState
 * Used when a fetch fails. Always give it onRetry so the user
 * isn't stuck — every page in this project reloads via useCallback
 * fetch functions, so onRetry is usually just that function.
 *
 * Props:
 *  - title    optional headline, defaults to "Something went wrong."
 *  - message  supporting copy, e.g. "We couldn't load this course."
 *  - onRetry  optional click handler — button only renders if passed
 * ============================================================ */
export const ErrorState = ({ title, message, onRetry }) => (
  <div className="state-view state-view--error">
    <div className="state-view__icon state-view__icon--error">
      <AlertTriangle size={26} />
    </div>
    <p className="state-view__title">{title || "Something went wrong."}</p>
    {message && <p className="state-view__message">{message}</p>}
    {onRetry && (
      <button className="state-view__action state-view__action--retry" onClick={onRetry}>
        <RefreshCw size={14} /> Try Again
      </button>
    )}
  </div>
);

/* ============================================================
 * LoadingState
 * Small inline spinner + label for spots that don't have a
 * dedicated skeleton (e.g. a modal, a drawer, a section refresh).
 * Full-page loads should keep using the skeleton markup already
 * in each page instead of this.
 *
 * Props:
 *  - label  optional text next to the spinner, defaults to "Loading..."
 * ============================================================ */
export const LoadingState = ({ label = "Loading..." }) => (
  <div className="state-view state-view--loading">
    <span className="state-view__spinner" />
    <p className="state-view__message">{label}</p>
  </div>
);
