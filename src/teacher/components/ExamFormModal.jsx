import { useEffect, useState } from "react";
import { X, UploadCloud, File as FileIcon, XCircle } from "lucide-react";
import { toast } from "react-toastify";
import { examService } from "../../services/api"; // ADJUST PATH to your project
import { buildExamPayload, isTeacherFaculty } from "../utils/examHelpers";
import QuestionEditor from "./QuestionEditor";
import "./ExamFormModal.css";

const initialForm = {
  title: "",
  description: "", // NOTE: UI-only, not sent — see examHelpers.buildExamPayload
  categoryId: "",
  examType: "EXAM",
  duration: "", // NOTE: UI-only
  totalMarks: "", // NOTE: UI-only
  passingMarks: "", // NOTE: UI-only
  uiStatus: "DRAFT", // NOTE: UI-only, backend has no status field
  startDate: "",
  startTime: "",
  endDate: "",
  endTime: "",
  deadlineDate: "",
  deadlineTime: "",
};

function toDateInput(d) {
  if (!d) return "";
  const date = new Date(d);
  if (isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}
function toTimeInput(d) {
  if (!d) return "";
  const date = new Date(d);
  if (isNaN(date.getTime())) return "";
  return date.toTimeString().slice(0, 5);
}

export default function ExamFormModal({
  userId,
  allowedCategories,
  editingExam,
  onClose,
  onSaved,
}) {
  const isEdit = Boolean(editingExam);
  const [form, setForm] = useState(initialForm);
  const [questions, setQuestions] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (editingExam) {
      setForm({
        title: editingExam.title || "",
        description: editingExam.description || "",
        categoryId: editingExam.categoryId ?? "",
        examType: editingExam.examType || "EXAM",
        duration: editingExam.duration ?? "",
        totalMarks: editingExam.totalMarks ?? "",
        passingMarks: editingExam.passingMarks ?? "",
        uiStatus: editingExam.status || "DRAFT",
        startDate: toDateInput(editingExam.startTime),
        startTime: toTimeInput(editingExam.startTime),
        endDate: toDateInput(editingExam.endTime),
        endTime: toTimeInput(editingExam.endTime),
        deadlineDate: toDateInput(editingExam.deadline),
        deadlineTime: toTimeInput(editingExam.deadline),
      });
    }
  }, [editingExam]);

  const update = (patch) => setForm((f) => ({ ...f, ...patch }));

  const validate = () => {
    if (!form.title.trim()) {
      toast.error("Exam title is required.");
      return false;
    }
    if (!form.categoryId) {
      toast.error("Please select a faculty.");
      return false;
    }
    if (!isTeacherFaculty(form.categoryId, allowedCategories)) {
      toast.error("You can only create exams for your assigned faculties.");
      return false;
    }
    if (!form.startDate || !form.startTime || !form.endDate || !form.endTime) {
      toast.error("Please set both start and end date/time.");
      return false;
    }
    if (questions.length === 0) {
      // Spec asks to require at least one question; kept as a soft warning
      // since questions are not yet persisted to the backend.
      toast.error("Please add at least one question.");
      return false;
    }
    return true;
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const allowedTypes = [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "image/png",
      "image/jpeg",
    ];
    if (!allowedTypes.includes(file.type)) {
      toast.error("Unsupported file type. Use PDF, DOC/DOCX or an image.");
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      toast.error("File is too large (max 15MB).");
      return;
    }
    setSelectedFile(file);
  };

  const formatSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleSubmit = async () => {
    if (!validate() || saving) return;
    setSaving(true);
    try {
      const payload = buildExamPayload(form);
      let examId;

      if (isEdit) {
        await examService.update(editingExam.id, payload);
        examId = editingExam.id;
        toast.success("Exam updated successfully.");
      } else {
        const res = await examService.create(userId, form.categoryId, payload);
        examId = res?.data?.examId ?? res?.data?.id;
        toast.success("Exam created successfully.");
      }

      if (selectedFile && examId) {
        setUploading(true);
        try {
          const fd = new FormData();
          fd.append("file", selectedFile);
          await examService.uploadFile(examId, fd);
        } catch {
          toast.error("Exam saved, but file upload failed.");
        } finally {
          setUploading(false);
        }
      }

      onSaved?.();
      onClose();
    } catch (err) {
      toast.error(isEdit ? "Failed to update exam." : "Failed to create exam.");
    } finally {
      setSaving(false);
    }
  };

  const busy = saving || uploading;

  return (
    <div className="efm-overlay" role="dialog" aria-modal="true">
      <div className="efm-modal">
        <div className="efm-header">
          <div>
            <h2>{isEdit ? "Edit Exam" : "Create New Exam"}</h2>
            <p>Fill in the details below for your assigned faculty.</p>
          </div>
          <button className="efm-close" onClick={onClose} disabled={busy}>
            <X size={20} />
          </button>
        </div>

        <div className="efm-body">
          {/* Section 1 — Basic Information */}
          <section className="efm-section">
            <h3>Basic Information</h3>
            <div className="efm-field">
              <label>Exam Title *</label>
              <input
                value={form.title}
                onChange={(e) => update({ title: e.target.value })}
                placeholder="e.g. Midterm Exam of Optional Math"
                maxLength={120}
              />
              <span className="efm-hint">{form.title.length}/120</span>
            </div>
            <div className="efm-field">
              <label>Description</label>
              <textarea
                value={form.description}
                onChange={(e) => update({ description: e.target.value })}
                placeholder="Brief description of this exam"
                rows={2}
              />
            </div>
            <div className="efm-field">
              <label>Faculty *</label>
              <select
                value={form.categoryId}
                onChange={(e) => update({ categoryId: e.target.value })}
                disabled={isEdit}
              >
                <option value="">Select Faculty</option>
                {allowedCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
              {allowedCategories.length === 0 && (
                <span className="efm-hint efm-hint--warn">
                  You have no assigned faculties yet.
                </span>
              )}
            </div>
          </section>

          {/* Section 2 — Exam Settings */}
          <section className="efm-section">
            <h3>Exam Settings</h3>
            <div className="efm-grid">
              <div className="efm-field">
                <label>Duration (minutes)</label>
                <input
                  type="number"
                  min={1}
                  value={form.duration}
                  onChange={(e) => update({ duration: e.target.value })}
                />
              </div>
              <div className="efm-field">
                <label>Exam Type</label>
                <select value={form.examType} onChange={(e) => update({ examType: e.target.value })}>
                  <option value="EXAM">Exam</option>
                  <option value="QUIZ">Quiz</option>
                </select>
                {/* NOTE: only "EXAM" confirmed from sample payload; "QUIZ" is a guess */}
              </div>
              <div className="efm-field">
                <label>Total Marks</label>
                <input
                  type="number"
                  min={0}
                  value={form.totalMarks}
                  onChange={(e) => update({ totalMarks: e.target.value })}
                />
              </div>
              <div className="efm-field">
                <label>Passing Marks</label>
                <input
                  type="number"
                  min={0}
                  value={form.passingMarks}
                  onChange={(e) => update({ passingMarks: e.target.value })}
                />
              </div>
              <div className="efm-field">
                <label>Status</label>
                <select value={form.uiStatus} onChange={(e) => update({ uiStatus: e.target.value })}>
                  <option value="DRAFT">Draft</option>
                  <option value="SCHEDULED">Scheduled</option>
                  <option value="PUBLISHED">Published</option>
                </select>
              </div>
            </div>

            <div className="efm-grid">
              <div className="efm-field">
                <label>Start Date *</label>
                <input type="date" value={form.startDate} onChange={(e) => update({ startDate: e.target.value })} />
              </div>
              <div className="efm-field">
                <label>Start Time *</label>
                <input type="time" value={form.startTime} onChange={(e) => update({ startTime: e.target.value })} />
              </div>
              <div className="efm-field">
                <label>End Date *</label>
                <input type="date" value={form.endDate} onChange={(e) => update({ endDate: e.target.value })} />
              </div>
              <div className="efm-field">
                <label>End Time *</label>
                <input type="time" value={form.endTime} onChange={(e) => update({ endTime: e.target.value })} />
              </div>
            </div>
          </section>

          {/* Section 3 — Exam Content */}
          <section className="efm-section">
            <h3>Exam Content</h3>
            <QuestionEditor questions={questions} onChange={setQuestions} />
          </section>

          {/* File upload */}
          <section className="efm-section">
            <h3>Attach Exam File (optional)</h3>
            {!selectedFile ? (
              <label className="efm-upload-drop">
                <UploadCloud size={22} />
                <span>Drag & drop, or click to upload exam file</span>
                <input type="file" hidden onChange={handleFileChange} accept=".pdf,.doc,.docx,image/*" />
              </label>
            ) : (
              <div className="efm-file-row">
                <FileIcon size={18} />
                <div className="efm-file-info">
                  <strong>{selectedFile.name}</strong>
                  <span>{formatSize(selectedFile.size)}</span>
                </div>
                <button type="button" onClick={() => setSelectedFile(null)} disabled={busy}>
                  <XCircle size={18} />
                </button>
              </div>
            )}
            {uploading && <p className="efm-hint">Uploading file...</p>}
          </section>
        </div>

        <div className="efm-footer">
          <button className="efm-btn-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="efm-btn-primary" onClick={handleSubmit} disabled={busy}>
            {saving ? "Creating Exam..." : isEdit ? "Save Changes" : "Create Exam"}
          </button>
        </div>
      </div>
    </div>
  );
}
