import { useEffect, useState } from "react";
import { X, Download } from "lucide-react";
import { toast } from "react-toastify";
import { examService } from "../../services/api"; // ADJUST PATH to your project
import { formatDate, formatTime, statusBadgeClass } from "../utils/examHelpers";
import "./ExamDetailsModal.css";

export default function ExamDetailsModal({ exam, onClose }) {
  const [fileUrl, setFileUrl] = useState(null);
  const [fileLoading, setFileLoading] = useState(false);

  // Guard first — before any hook logic touches `exam` fields.
  useEffect(() => {
    let objectUrl;
    async function loadFile() {
      if (!exam?.fileName) return;
      setFileLoading(true);
      try {
        const res = await examService.getFile(exam.fileName);
        objectUrl = URL.createObjectURL(res.data);
        setFileUrl(objectUrl);
      } catch {
        toast.error("Failed to load attached file.");
      } finally {
        setFileLoading(false);
      }
    }
    loadFile();
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
    // Safe dependency — never crashes if exam is undefined/null.
  }, [exam?.fileName]);

  // Component must never render (or read exam.*) when no exam is selected.
  if (!exam) return null;

  return (
    <div className="edm-overlay" role="dialog" aria-modal="true">
      <div className="edm-modal">
        <div className="edm-header">
          <div>
            <h2>{exam?.title ?? "Untitled Exam"}</h2>
            <span className={statusBadgeClass(exam?.status)}>{exam?.status ?? "DRAFT"}</span>
          </div>
          <button className="edm-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="edm-body">
          {exam?.description && <p className="edm-description">{exam.description}</p>}

          <div className="edm-grid">
            <div>
              <span className="edm-label">Faculty</span>
              <span className="edm-value">{exam?.facultyName ?? "N/A"}</span>
            </div>
            <div>
              <span className="edm-label">Exam Type</span>
              <span className="edm-value">{exam?.examType ?? "N/A"}</span>
            </div>
            <div>
              <span className="edm-label">Duration</span>
              <span className="edm-value">{exam?.duration ? `${exam.duration} min` : "N/A"}</span>
            </div>
            <div>
              <span className="edm-label">Total Marks</span>
              <span className="edm-value">{exam?.totalMarks ?? "N/A"}</span>
            </div>
            <div>
              <span className="edm-label">Passing Marks</span>
              <span className="edm-value">{exam?.passingMarks ?? "N/A"}</span>
            </div>
            <div>
              <span className="edm-label">Start</span>
              <span className="edm-value">
                {formatDate(exam?.startTime)} · {formatTime(exam?.startTime)}
              </span>
            </div>
            <div>
              <span className="edm-label">End</span>
              <span className="edm-value">
                {formatDate(exam?.endTime)} · {formatTime(exam?.endTime)}
              </span>
            </div>
            {exam?.deadline && (
              <div>
                <span className="edm-label">Deadline</span>
                <span className="edm-value">{formatDate(exam.deadline)}</span>
              </div>
            )}
          </div>

          <div className="edm-file-section">
            <span className="edm-label">Attached File</span>
            {!exam?.fileName && <p className="edm-value">No file attached.</p>}
            {exam?.fileName && fileLoading && <p className="edm-value">Loading file...</p>}
            {exam?.fileName && fileUrl && (
              <a className="edm-file-link" href={fileUrl} download={exam.fileName} target="_blank" rel="noreferrer">
                <Download size={16} /> {exam.fileName}
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}