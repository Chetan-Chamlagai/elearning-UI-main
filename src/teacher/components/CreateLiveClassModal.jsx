import { useEffect, useState } from "react";
import { X, Send, Pencil } from "lucide-react";
import { toast } from "react-toastify";
import { liveClassService } from "../../services/api"; // ADJUST PATH to your project
import { buildLiveClassPayload, isTeacherFaculty } from "../utils/liveClassHelpers";
import "./CreateLiveClassModal.css";

const initialForm = {
  title: "",
  categoryId: "",
  date: "",
  time: "",
  description: "",
  duration: "",
  meetingUrl: "",
};

export default function CreateLiveClassModal({
  userId,
  allowedCategories,
  editingClass, // null => inline create card; set => overlay edit modal
  onClose,      // only used in edit mode
  onSaved,
}) {
  const isEdit = Boolean(editingClass);
  const [form, setForm] = useState(initialForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editingClass) {
      setForm({
        title: editingClass.title || "",
        categoryId: editingClass.categoryId ?? "",
        date: editingClass.startTime ? editingClass.startTime.slice(0, 10) : "",
        time: editingClass.startTime ? editingClass.startTime.slice(11, 16) : "",
        description: editingClass.description || "",
        duration: editingClass.duration ?? "",
        meetingUrl: editingClass.meetingUrl || "",
      });
    }
  }, [editingClass]);

  const update = (patch) => setForm((f) => ({ ...f, ...patch }));

  const resetForm = () => setForm(initialForm);

  const validate = () => {
    if (!form.title.trim()) {
      toast.error("Session title is required.");
      return false;
    }
    if (!form.categoryId) {
      toast.error("Please select a faculty/category.");
      return false;
    }
    if (!isTeacherFaculty(form.categoryId, allowedCategories)) {
      toast.error("You can only schedule sessions for your assigned faculties.");
      return false;
    }
    if (!form.date || !form.time) {
      toast.error("Please set both date and time.");
      return false;
    }
    return true;
  };

  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    if (!validate() || saving) return;
    setSaving(true);
    try {
      const payload = buildLiveClassPayload(form);

      if (isEdit) {
        await liveClassService.update(editingClass.id, payload);
        toast.success("Live class updated successfully.");
        onClose?.();
      } else {
        await liveClassService.create(userId, form.categoryId, payload);
        toast.success("Live class scheduled successfully.");
        resetForm();
      }

      onSaved?.();
    } catch {
      toast.error(isEdit ? "Failed to update live class." : "Failed to schedule live class.");
    } finally {
      setSaving(false);
    }
  };

  const formBody = (
    <form className="clcm-form" onSubmit={handleSubmit}>
      <div className="clcm-field">
        <label>Session Title *</label>
        <input
          value={form.title}
          onChange={(e) => update({ title: e.target.value })}
          placeholder="e.g. Advanced Macroeconomics"
          maxLength={120}
        />
      </div>

      <div className="clcm-field">
        <label>Faculty / Category *</label>
        <select
          value={form.categoryId}
          onChange={(e) => update({ categoryId: e.target.value })}
          disabled={isEdit || allowedCategories.length === 0}
        >
          <option value="">Select Faculty</option>
          {allowedCategories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </select>
        {allowedCategories.length === 0 && (
          <span className="clcm-hint clcm-hint--warn">
            You have no assigned faculties yet.
          </span>
        )}
      </div>

      <div className="clcm-grid">
        <div className="clcm-field">
          <label>Date *</label>
          <input type="date" value={form.date} onChange={(e) => update({ date: e.target.value })} />
        </div>
        <div className="clcm-field">
          <label>Time *</label>
          <input type="time" value={form.time} onChange={(e) => update({ time: e.target.value })} />
        </div>
      </div>

      <div className="clcm-field">
        <label>Description</label>
        <textarea
          value={form.description}
          onChange={(e) => update({ description: e.target.value })}
          placeholder="Briefly describe the session objectives..."
          rows={3}
        />
      </div>

      <div className="clcm-grid">
        <div className="clcm-field">
          <label>Duration (minutes)</label>
          <input
            type="number"
            min={1}
            value={form.duration}
            onChange={(e) => update({ duration: e.target.value })}
          />
        </div>
        <div className="clcm-field">
          <label>Meeting URL</label>
          <input
            value={form.meetingUrl}
            onChange={(e) => update({ meetingUrl: e.target.value })}
            placeholder="https://..."
          />
        </div>
      </div>

      <div className="clcm-actions">
        {isEdit && (
          <button type="button" className="clcm-btn-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
        )}
        <button
          type="submit"
          className="clcm-btn-primary"
          disabled={saving || allowedCategories.length === 0}
        >
          {isEdit ? (
            <>
              <Pencil size={16} /> {saving ? "Saving..." : "Save Changes"}
            </>
          ) : (
            <>
              <Send size={16} /> {saving ? "Scheduling..." : "Schedule Session"}
            </>
          )}
        </button>
      </div>
    </form>
  );

  if (!isEdit) {
    // Inline card — matches the always-visible "Create Live Class" panel in the screenshot.
    return (
      <div className="clcm-card">
        <h2 className="clcm-card-title">
          <span className="clcm-plus">+</span> Create Live Class
        </h2>
        {formBody}
      </div>
    );
  }

  // Edit mode — overlay modal.
  return (
    <div className="clcm-overlay" role="dialog" aria-modal="true">
      <div className="clcm-modal">
        <div className="clcm-modal-header">
          <h2>Edit Live Class</h2>
          <button className="clcm-close" onClick={onClose} disabled={saving}>
            <X size={20} />
          </button>
        </div>
        {formBody}
      </div>
    </div>
  );
}