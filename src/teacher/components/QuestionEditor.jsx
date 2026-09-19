import { useState } from "react";
import { Plus, Trash2, Pencil } from "lucide-react";
import "./QuestionEditor.css";

/**
 * QuestionEditor
 * ---------------------------------------------------------------------
 * ⚠️ NOTE: The confirmed backend Exam DTO (title/deadline/startTime/
 * endTime/examType) has NO field for storing questions, and api.js has
 * no question-related endpoint. This component is fully functional in
 * the UI (add/edit/delete/local validation) but the resulting `questions`
 * array is currently NOT sent anywhere — it's kept in local state so the
 * teacher can draft content, and is passed up via onChange in case you
 * want to wire it to a future endpoint or stash it in `description`.
 * ---------------------------------------------------------------------
 */

const emptyQuestion = () => ({
  localId: crypto.randomUUID(),
  text: "",
  type: "MCQ", // MCQ | TRUE_FALSE | SHORT_ANSWER
  options: ["", "", "", ""],
  correctAnswer: "",
  marks: 1,
});

export default function QuestionEditor({ questions, onChange, maxQuestions = 50 }) {
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState(null);

  const startAdd = () => {
    const q = emptyQuestion();
    setDraft(q);
    setEditingId(q.localId);
  };

  const startEdit = (q) => {
    setDraft({ ...q });
    setEditingId(q.localId);
  };

  const cancelEdit = () => {
    setDraft(null);
    setEditingId(null);
  };

  const saveDraft = () => {
    if (!draft.text.trim()) return;
    const exists = questions.some((q) => q.localId === draft.localId);
    const next = exists
      ? questions.map((q) => (q.localId === draft.localId ? draft : q))
      : [...questions, draft];
    onChange(next);
    cancelEdit();
  };

  const removeQuestion = (localId) => {
    onChange(questions.filter((q) => q.localId !== localId));
  };

  const updateDraft = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const updateOption = (idx, value) => {
    const options = [...draft.options];
    options[idx] = value;
    updateDraft({ options });
  };

  return (
    <div className="qe-wrapper">
      <div className="qe-header">
        <span className="qe-counter">
          Questions: {questions.length} / {maxQuestions}
        </span>
        {!draft && (
          <button type="button" className="qe-add-btn" onClick={startAdd}>
            <Plus size={16} /> Add Question
          </button>
        )}
      </div>

      {questions.length === 0 && !draft && (
        <div className="qe-empty">No questions added yet.</div>
      )}

      <div className="qe-list">
        {questions.map((q, idx) =>
          q.localId === editingId && draft ? null : (
            <div className="qe-card" key={q.localId}>
              <div className="qe-card-head">
                <span className="qe-card-title">Question {idx + 1}</span>
                <span className="qe-card-marks">Marks: {q.marks}</span>
              </div>
              <p className="qe-card-text">{q.text}</p>
              {q.type === "MCQ" && (
                <ul className="qe-options">
                  {q.options.filter(Boolean).map((opt, i) => (
                    <li key={i} className={opt === q.correctAnswer ? "qe-option-correct" : ""}>
                      {opt}
                    </li>
                  ))}
                </ul>
              )}
              {q.type !== "MCQ" && (
                <p className="qe-answer-hint">Answer: {q.correctAnswer || "—"}</p>
              )}
              <div className="qe-card-actions">
                <button type="button" onClick={() => startEdit(q)}>
                  <Pencil size={14} /> Edit
                </button>
                <button type="button" className="qe-delete" onClick={() => removeQuestion(q.localId)}>
                  <Trash2 size={14} /> Delete
                </button>
              </div>
            </div>
          )
        )}
      </div>

      {draft && (
        <div className="qe-form">
          <label>Question text</label>
          <textarea
            value={draft.text}
            onChange={(e) => updateDraft({ text: e.target.value })}
            placeholder="Type the question..."
            rows={2}
          />

          <label>Question type</label>
          <select
            value={draft.type}
            onChange={(e) => updateDraft({ type: e.target.value, correctAnswer: "" })}
          >
            <option value="MCQ">Multiple Choice</option>
            <option value="TRUE_FALSE">True / False</option>
            <option value="SHORT_ANSWER">Short Answer</option>
          </select>

          {draft.type === "MCQ" && (
            <div className="qe-options-edit">
              {draft.options.map((opt, i) => (
                <input
                  key={i}
                  value={opt}
                  placeholder={`Option ${String.fromCharCode(65 + i)}`}
                  onChange={(e) => updateOption(i, e.target.value)}
                />
              ))}
              <label>Correct answer</label>
              <select
                value={draft.correctAnswer}
                onChange={(e) => updateDraft({ correctAnswer: e.target.value })}
              >
                <option value="">Select correct option</option>
                {draft.options.filter(Boolean).map((opt, i) => (
                  <option key={i} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>
          )}

          {draft.type === "TRUE_FALSE" && (
            <select
              value={draft.correctAnswer}
              onChange={(e) => updateDraft({ correctAnswer: e.target.value })}
            >
              <option value="">Select answer</option>
              <option value="True">True</option>
              <option value="False">False</option>
            </select>
          )}

          {draft.type === "SHORT_ANSWER" && (
            <input
              value={draft.correctAnswer}
              placeholder="Expected answer (for grading reference)"
              onChange={(e) => updateDraft({ correctAnswer: e.target.value })}
            />
          )}

          <label>Marks</label>
          <input
            type="number"
            min={1}
            value={draft.marks}
            onChange={(e) => updateDraft({ marks: Number(e.target.value) || 1 })}
          />

          <div className="qe-form-actions">
            <button type="button" className="qe-cancel" onClick={cancelEdit}>
              Cancel
            </button>
            <button type="button" className="qe-save" onClick={saveDraft} disabled={!draft.text.trim()}>
              Save Question
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
