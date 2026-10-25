import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  ExternalLink,
  LayoutGrid,
  List,
  Loader2,
  Save,
  Search,
  Trash2
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { applicationApi, materialApi } from "../api/queries";
import { Button } from "../components/Button";
import { ErrorBanner } from "../components/ErrorBanner";
import { Field, inputClass } from "../components/Field";
import { LoadingState } from "../components/LoadingState";
import { StatusPill } from "../components/StatusPill";
import { cx, formatDate } from "../utils/format";

const statuses = ["SAVED", "PREPARING", "APPLIED", "INTERVIEW", "OFFER", "REJECTED"];

function updateStatusWithConfirmation(current, next, onUpdate) {
  if (
    next === "APPLIED" &&
    current !== "APPLIED" &&
    !window.confirm("Confirm that you submitted this application on the employer's website?")
  ) {
    return;
  }
  onUpdate({ status: next, ...(next === "APPLIED" ? { confirmedSubmitted: true } : {}) });
}

export function ApplicationTracker() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [view, setView] = useState("kanban");
  const [deletingId, setDeletingId] = useState("");
  const [selectedId, setSelectedId] = useState(searchParams.get("focus") || "");
  const statusFilter = searchParams.get("status") || "";

  const applicationsQuery = useQuery({ queryKey: ["applications"], queryFn: applicationApi.list });
  const materialsQuery = useQuery({ queryKey: ["resume-versions"], queryFn: materialApi.list });

  useEffect(() => {
    const focus = searchParams.get("focus");
    if (focus && focus !== "alerts") setSelectedId(focus);
  }, [searchParams]);

  const invalidatePipeline = () => {
    queryClient.invalidateQueries({ queryKey: ["applications"] });
    queryClient.invalidateQueries({ queryKey: ["analytics"] });
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
  };

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }) => applicationApi.update(id, payload),
    onSuccess: invalidatePipeline
  });
  const deleteMutation = useMutation({
    mutationFn: (id) => applicationApi.remove(id),
    onMutate: (id) => setDeletingId(id),
    onSettled: () => setDeletingId(""),
    onSuccess: () => {
      if (selectedId === deletingId) setSelectedId("");
      invalidatePipeline();
    }
  });

  const handleDelete = (application) => {
    const label = application.internship?.title || "this application";
    if (window.confirm(`Remove "${label}" from your tracker? This cannot be undone.`)) {
      deleteMutation.mutate(application._id);
    }
  };

  const filtered = useMemo(() => {
    const term = search.toLowerCase();
    const applications = (applicationsQuery.data?.applications || []).filter((item) => !item.archived);
    return applications.filter((application) => {
      if (statusFilter && application.status !== statusFilter) return false;
      return `${application.internship?.title} ${application.internship?.company} ${application.notes}`
        .toLowerCase()
        .includes(term);
    });
  }, [applicationsQuery.data, search, statusFilter]);

  const selected = filtered.find((item) => String(item._id) === String(selectedId)) || null;
  const selectedDraft = (materialsQuery.data?.resumeVersions || []).find(
    (item) => String(item.internshipId) === String(selected?.internshipId || selected?.internship?._id)
  );

  if (applicationsQuery.isLoading) return <LoadingState label="Loading tracker" />;

  return (
    <div className="grid gap-5">
      <ErrorBanner error={applicationsQuery.error || updateMutation.error || deleteMutation.error} />
      <section className="rounded-lg border border-ink/10 bg-white p-5 shadow-soft">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-black text-ink">Application Tracker</h2>
            <p className="text-sm font-semibold text-ink/55">{filtered.length} tracked applications</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-md border border-ink/10 bg-paper p-1">
              <button
                type="button"
                className={cx("rounded px-3 py-1.5 text-xs font-black", view === "kanban" ? "bg-white text-ink shadow-soft" : "text-ink/50")}
                onClick={() => setView("kanban")}
              >
                <LayoutGrid className="mr-1 inline h-3.5 w-3.5" />
                Kanban
              </button>
              <button
                type="button"
                className={cx("rounded px-3 py-1.5 text-xs font-black", view === "list" ? "bg-white text-ink shadow-soft" : "text-ink/50")}
                onClick={() => setView("list")}
              >
                <List className="mr-1 inline h-3.5 w-3.5" />
                List
              </button>
            </div>
            <select
              className={`${inputClass} w-40`}
              value={statusFilter}
              onChange={(event) => {
                setSearchParams((prev) => {
                  const next = Object.fromEntries(prev.entries());
                  if (event.target.value) next.status = event.target.value;
                  else delete next.status;
                  return next;
                });
              }}
            >
              <option value="">All statuses</option>
              {statuses.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
            <label className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/40" />
              <input
                className={`${inputClass} pl-10`}
                placeholder="Search company, role, notes"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
          </div>
        </div>
      </section>

      {view === "kanban" ? (
        <section className="grid gap-4 xl:grid-cols-6">
          {statuses.map((status) => (
            <div key={status} className="min-h-96 rounded-lg border border-ink/10 bg-white p-3 shadow-soft">
              <div className="mb-3 flex items-center justify-between gap-2">
                <StatusPill status={status} />
                <span className="text-xs font-black text-ink/40">
                  {filtered.filter((application) => application.status === status).length}
                </span>
              </div>
              <div className="grid gap-3">
                {filtered
                  .filter((application) => application.status === status)
                  .map((application) => (
                    <ApplicationCard
                      key={application._id}
                      application={application}
                      selected={String(application._id) === String(selectedId)}
                      onSelect={() => setSelectedId(application._id)}
                      onUpdate={(payload) => updateMutation.mutate({ id: application._id, payload })}
                      onDelete={() => handleDelete(application)}
                      isUpdating={updateMutation.isPending && updateMutation.variables?.id === application._id}
                      isDeleting={deletingId === application._id}
                    />
                  ))}
              </div>
            </div>
          ))}
        </section>
      ) : (
        <section className="min-w-0 rounded-lg border border-ink/10 bg-white shadow-soft">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-ink/10 bg-paper text-xs font-black uppercase tracking-wide text-ink/50">
                <tr>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Applied</th>
                  <th className="px-4 py-3">Next / Interview</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length ? (
                  filtered.map((application) => (
                    <tr
                      key={application._id}
                      className={cx(
                        "border-b border-ink/5",
                        String(application._id) === String(selectedId) ? "bg-moss/5" : "hover:bg-paper"
                      )}
                    >
                      <td className="px-4 py-3">
                        <button type="button" className="text-left" onClick={() => setSelectedId(application._id)}>
                          <p className="font-black text-ink">{application.internship?.title}</p>
                          <p className="text-xs font-bold text-ink/50">{application.internship?.company}</p>
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <StatusPill status={application.status} />
                      </td>
                      <td className="px-4 py-3 font-semibold text-ink/60">{formatDate(application.appliedAt)}</td>
                      <td className="px-4 py-3 font-semibold text-ink/60">
                        {formatDate(application.interviewDate || application.nextActionDate)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          {application.internship?._id ? (
                            <Link className="text-xs font-black text-moss" to={`/internships/${application.internship._id}`}>
                              Details
                            </Link>
                          ) : null}
                          {application.internship?.applyLink ? (
                            <a
                              className="text-xs font-black text-ink/60"
                              href={application.internship.applyLink}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              Apply link
                            </a>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-sm font-semibold text-ink/55">
                      No applications in this view. Save an internship from Explorer to begin.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {selected ? (
        <ApplicationDetailPanel
          application={selected}
          draft={selectedDraft}
          onUpdate={(payload) => updateMutation.mutate({ id: selected._id, payload })}
          onDelete={() => handleDelete(selected)}
          onClose={() => setSelectedId("")}
          isUpdating={updateMutation.isPending && updateMutation.variables?.id === selected._id}
          isDeleting={deletingId === selected._id}
        />
      ) : null}
    </div>
  );
}

function ApplicationCard({ application, selected, onSelect, onUpdate, onDelete, isUpdating, isDeleting }) {
  const [notes, setNotes] = useState(application.notes || "");
  const disabled = isUpdating || isDeleting;

  useEffect(() => {
    setNotes(application.notes || "");
  }, [application.notes]);

  return (
    <article
      className={cx(
        "rounded-md border bg-paper p-3",
        selected ? "border-moss/50" : "border-ink/10",
        isDeleting ? "opacity-60" : ""
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <button type="button" className="min-w-0 flex-1 text-left" onClick={onSelect}>
          <h3 className="break-words text-sm font-black leading-5 text-ink">{application.internship?.title}</h3>
          <p className="text-xs font-bold text-ink/50">{application.internship?.company}</p>
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={disabled}
          aria-label="Remove application from tracker"
          title="Remove from tracker"
          className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-ink/10 bg-white text-ink/45 transition hover:border-coral/40 hover:text-coral disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
        </button>
      </div>
      <div className="mt-3 grid gap-2">
        <select
          className="min-h-10 rounded-md border border-ink/10 bg-white px-2 text-xs font-bold outline-none focus:border-moss"
          value={application.status}
          onChange={(event) => updateStatusWithConfirmation(application.status, event.target.value, onUpdate)}
          disabled={disabled}
        >
          {statuses.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
        <input
          className="min-h-10 rounded-md border border-ink/10 bg-white px-2 text-xs font-bold outline-none focus:border-moss"
          type="date"
          value={application.nextActionDate ? String(application.nextActionDate).slice(0, 10) : ""}
          onChange={(event) => onUpdate({ nextActionDate: event.target.value })}
          disabled={disabled}
        />
        <textarea
          className="min-h-24 rounded-md border border-ink/10 bg-white px-2 py-2 text-xs font-semibold outline-none focus:border-moss"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          disabled={disabled}
        />
        <Button
          className="min-h-9 px-3 text-xs"
          variant="secondary"
          icon={Save}
          loading={isUpdating}
          disabled={disabled}
          onClick={() => onUpdate({ notes })}
        >
          Save
        </Button>
      </div>
      <p className="mt-3 text-[11px] font-bold text-ink/45">Next: {formatDate(application.nextActionDate)}</p>
    </article>
  );
}

function ApplicationDetailPanel({ application, draft, onUpdate, onDelete, onClose, isUpdating, isDeleting }) {
  const [notes, setNotes] = useState(application.notes || "");
  const [interviewNotes, setInterviewNotes] = useState(application.interviewNotes || "");

  useEffect(() => {
    setNotes(application.notes || "");
    setInterviewNotes(application.interviewNotes || "");
  }, [application]);

  return (
    <section className="rounded-lg border border-ink/10 bg-white p-5 shadow-soft">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-xl font-black text-ink">{application.internship?.title}</h3>
          <p className="text-sm font-semibold text-ink/55">{application.internship?.company}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusPill status={application.status} />
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <Field label="Status">
          <select
            className={inputClass}
            value={application.status}
            onChange={(event) => updateStatusWithConfirmation(application.status, event.target.value, onUpdate)}
            disabled={isUpdating}
          >
            {statuses.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Reminder / next action">
          <input
            className={inputClass}
            type="date"
            value={application.nextActionDate ? String(application.nextActionDate).slice(0, 10) : ""}
            onChange={(event) => onUpdate({ nextActionDate: event.target.value })}
            disabled={isUpdating}
          />
        </Field>
        <Field label="Interview date">
          <input
            className={inputClass}
            type="date"
            value={application.interviewDate ? String(application.interviewDate).slice(0, 10) : ""}
            onChange={(event) => onUpdate({ interviewDate: event.target.value })}
            disabled={isUpdating}
          />
        </Field>
        <Field label="Applied">
          <input className={inputClass} disabled value={formatDate(application.appliedAt)} />
        </Field>
        <Field label="Notes">
          <textarea className={`${inputClass} min-h-28`} value={notes} onChange={(event) => setNotes(event.target.value)} />
        </Field>
        <Field label="Interview details">
          <textarea
            className={`${inputClass} min-h-28`}
            value={interviewNotes}
            onChange={(event) => setInterviewNotes(event.target.value)}
            placeholder="Panel, round, prep notes"
          />
        </Field>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          icon={Save}
          loading={isUpdating}
          onClick={() => onUpdate({ notes, interviewNotes })}
        >
          Save Notes
        </Button>
        {application.internship?.applyLink ? (
          <a
            className="inline-flex min-h-10 items-center gap-2 rounded-md border border-ink/10 bg-white px-4 text-sm font-semibold text-ink"
            href={application.internship.applyLink}
            target="_blank"
            rel="noopener noreferrer"
          >
            <ExternalLink className="h-4 w-4" />
            Open Application Link
          </a>
        ) : null}
        {application.internshipId || application.internship?._id ? (
          <Link
            className="inline-flex min-h-10 items-center rounded-md border border-ink/10 bg-white px-4 text-sm font-semibold text-ink"
            to={`/internships/${application.internshipId || application.internship._id}`}
          >
            View / Edit Draft
          </Link>
        ) : null}
        <Button
          variant="secondary"
          icon={Archive}
          loading={isUpdating}
          onClick={() => {
            if (window.confirm("Archive this application? It will hide from the active board.")) {
              onUpdate({ archived: true });
              onClose();
            }
          }}
        >
          Archive
        </Button>
        <Button variant="danger" icon={Trash2} loading={isDeleting} onClick={onDelete}>
          Delete
        </Button>
      </div>

      {draft ? (
        <div className="mt-5 rounded-md bg-paper p-4">
          <p className="text-sm font-black text-ink">Linked draft</p>
          <p className="mt-1 text-sm font-semibold text-ink/60">
            {draft.approved ? "Approved" : "Draft"} · {(draft.changeSummary || []).slice(0, 2).join(" · ") || "Tailored materials available"}
          </p>
        </div>
      ) : (
        <p className="mt-5 text-sm font-semibold text-ink/55">No application draft linked yet. Use Prepare Application on the internship page.</p>
      )}
    </section>
  );
}
