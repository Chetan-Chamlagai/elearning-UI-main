import { X, ExternalLink } from "lucide-react";
import { formatDate, formatTime, statusBadgeClass } from "../utils/liveClassHelpers";
import "./LiveClassDetailsModal.css";

export default function LiveClassDetailsModal({ liveClass, onClose }) {
  if (!liveClass) return null;

  return (
    <div className="lcdm-overlay" role="dialog" aria-modal="true">
      <div className="lcdm-modal">
        <div className="lcdm-header">
          <div>
            <h2>{liveClass?.title ?? "Untitled Session"}</h2>
            <span className={statusBadgeClass(liveClass?.status)}>{liveClass?.status ?? "UPCOMING"}</span>
          </div>
          <button className="lcdm-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="lcdm-body">
          {liveClass?.description && <p className="lcdm-description">{liveClass.description}</p>}

          <div className="lcdm-grid">
            <div>
              <span className="lcdm-label">Faculty</span>
              <span className="lcdm-value">{liveClass?.facultyName ?? "N/A"}</span>
            </div>
            <div>
              <span className="lcdm-label">Teacher</span>
              <span className="lcdm-value">{liveClass?.teacherName ?? "N/A"}</span>
            </div>
            <div>
              <span className="lcdm-label">Date</span>
              <span className="lcdm-value">{formatDate(liveClass?.startTime)}</span>
            </div>
            <div>
              <span className="lcdm-label">Time</span>
              <span className="lcdm-value">{formatTime(liveClass?.startTime)}</span>
            </div>
            <div>
              <span className="lcdm-label">Duration</span>
              <span className="lcdm-value">{liveClass?.duration ? `${liveClass.duration} mins` : "N/A"}</span>
            </div>
            <div>
              <span className="lcdm-label">Enrolled</span>
              <span className="lcdm-value">{liveClass?.enrolled ?? "N/A"}</span>
            </div>
            <div>
              <span className="lcdm-label">Attendance</span>
              <span className="lcdm-value">
                {liveClass?.attendance != null ? `${liveClass.attendance}%` : "N/A"}
              </span>
            </div>
          </div>

          {liveClass?.meetingUrl && (
            <a className="lcdm-link" href={liveClass.meetingUrl} target="_blank" rel="noreferrer">
              <ExternalLink size={16} /> Open meeting link
            </a>
          )}
        </div>
      </div>
    </div>
  );
}