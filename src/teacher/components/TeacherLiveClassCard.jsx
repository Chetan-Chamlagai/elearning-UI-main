import { Play, Pencil, Trash2, Eye, Clock, Users, Calendar } from "lucide-react";
import { formatDate, formatTime, statusBadgeClass } from "../utils/liveClassHelpers";
import "./LiveClassCard.css";

export default function LiveClassCard({ liveClass, onStart, onManage, onView, onDelete, highlight }) {
  if (!liveClass) return null;

  return (
    <div className={`lcc-card ${highlight ? "lcc-card--highlight" : ""}`}>
      <div className="lcc-thumb">
        <span className={statusBadgeClass(liveClass.status)}>
          {liveClass.status === "LIVE" ? "STARTING SOON" : liveClass.status}
        </span>
      </div>

      <div className="lcc-body">
        <div className="lcc-title-row">
          <h3 className="lcc-title">{liveClass?.title ?? "Untitled Session"}</h3>
          <span className="lcc-faculty-badge">{liveClass?.facultyName ?? "N/A"}</span>
        </div>

        {liveClass?.teacherName && <p className="lcc-teacher">{liveClass.teacherName}</p>}

        <div className="lcc-meta">
          <span>
            <Calendar size={14} /> {formatDate(liveClass?.startTime)}
          </span>
          <span>
            <Clock size={14} /> {formatTime(liveClass?.startTime)}
          </span>
        </div>

        <div className="lcc-meta">
          <span>
            <Clock size={14} /> {liveClass?.duration ? `${liveClass.duration} mins` : "N/A"}
          </span>
          <span>
            <Users size={14} />{" "}
            {liveClass?.joined != null
              ? `${liveClass.joined} Joined`
              : liveClass?.enrolled != null
              ? `${liveClass.enrolled} Enrolled`
              : "N/A"}
          </span>
        </div>

        <div className="lcc-actions">
          {liveClass.status === "LIVE" ? (
            <button className="lcc-btn-primary" onClick={() => onStart(liveClass)}>
              <Play size={16} /> Start Session
            </button>
          ) : (
            <button className="lcc-btn-secondary" onClick={() => onManage(liveClass)}>
              <Pencil size={16} /> Manage
            </button>
          )}
          <button className="lcc-icon-btn" title="View details" onClick={() => onView(liveClass)}>
            <Eye size={16} />
          </button>
          <button className="lcc-icon-btn lcc-icon-btn--danger" title="Delete" onClick={() => onDelete(liveClass)}>
            <Trash2 size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}