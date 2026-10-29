import {
  Activity,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Bug,
  CheckCheck,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Circle,
  CircleDot,
  Command,
  FileText,
  FolderKanban,
  Hash,
  History,
  LogOut,
  Menu,
  MessageCircle,
  Plus,
  Search,
  Settings2,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import ReactMarkdown from "react-markdown";
import {
  api,
  type Comment,
  type HistoryEntry,
  type Issue,
  type IssueFilters,
  type IssuePage,
  type Project,
  type ProjectMember,
  type User,
} from "./api.js";

const STATUSES = ["Open", "In progress", "In review", "Closed"] as const;
const PRIORITIES = ["Urgent", "High", "Medium", "Low"] as const;
const DEMO_TOKEN = "orbit.demo.token";
const DEMO_USER = "orbit.demo.user";

function initials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function StatusMark({ status }: { status: Issue["status"] }) {
  const Icon =
    status === "Closed"
      ? CheckCircle2
      : status === "In progress"
        ? CircleDot
        : status === "In review"
          ? CheckCheck
          : Circle;
  return (
    <span className={`status-mark status-${status.toLowerCase().replaceAll(" ", "-")}`}>
      <Icon size={15} strokeWidth={1.8} />
      {status}
    </span>
  );
}

function PriorityMark({ priority }: { priority: Issue["priority"] }) {
  const Icon =
    priority === "Urgent" || priority === "High"
      ? ArrowUp
      : priority === "Low"
        ? ArrowDown
        : Circle;
  return (
    <span className={`priority-mark priority-${priority.toLowerCase()}`}>
      <Icon size={14} strokeWidth={2} />
      {priority}
    </span>
  );
}

function Avatar({ name, className = "" }: { name: string; className?: string }) {
  return <span className={`avatar ${className}`} title={name}>{initials(name)}</span>;
}

function Login({ onLogin }: { onLogin: (token: string, user: User) => void }) {
  const [username, setUsername] = useState("alex");
  const [password, setPassword] = useState("orbit-demo");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = await api<{ token: string; user: User }>("/auth/login", null, {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });
      onLogin(result.token, result.user);
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "Could not sign in.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-page">
      <div className="login-card">
        <div className="brand brand-login"><span className="brand-icon"><Command size={19} /></span> orbit</div>
        <div className="login-heading">
          <span className="eyebrow">YOUR TEAM, IN ORBIT</span>
          <h1>Good work starts<br />with a clear view.</h1>
          <p>Sign in to pick up where your team left off.</p>
        </div>
        <form className="login-form" onSubmit={(event) => void submit(event)}>
          <label htmlFor="username">Username</label>
          <input id="username" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" required />
          <label htmlFor="password">Password</label>
          <input id="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required />
          {error && <p className="form-error">{error}</p>}
          <button className="button button-primary login-submit" disabled={loading}>
            {loading ? "Signing in…" : "Sign in"} <ArrowRight size={16} />
          </button>
        </form>
        <div className="demo-hint">
          <Sparkles size={15} />
          <span>Demo access <strong>alex</strong>, <strong>sam</strong> or <strong>jordan</strong><br />Password <strong>orbit-demo</strong></span>
        </div>
      </div>
      <div className="login-art" aria-hidden="true">
        <div className="art-glow" />
        <div className="orbit-ring ring-one" /><div className="orbit-ring ring-two" /><div className="orbit-ring ring-three" />
        <div className="planet"><div className="planet-light" /></div>
        <span className="art-star star-one">✳</span><span className="art-star star-two">✦</span>
        <span className="art-label">A little more focus.<br />A lot less chasing.</span>
      </div>
    </main>
  );
}

function App() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(DEMO_TOKEN));
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem(DEMO_USER);
    return saved ? (JSON.parse(saved) as User) : null;
  });
  const [projects, setProjects] = useState<Project[]>([]);
  const [project, setProject] = useState<Project | null>(null);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [pageData, setPageData] = useState<IssuePage | null>(null);
  const [filters, setFilters] = useState<IssueFilters>({ page: 1, limit: 10, search: "" });
  const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null);
  const [modal, setModal] = useState<"issue" | "project" | "members" | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [mobileNav, setMobileNav] = useState(false);

  const loadProjects = useCallback(async () => {
    if (!token) return;
    const [projectList, userList] = await Promise.all([
      api<Project[]>("/projects", token),
      api<User[]>("/users", token),
    ]);
    setProjects(projectList);
    setUsers(userList);
    setProject((current) =>
      projectList.find((item) => item.id === current?.id) ?? projectList[0] ?? null,
    );
  }, [token]);

  useEffect(() => {
    if (!token) return;
    let active = true;
    Promise.all([
      api<User>("/me", token),
      api<Project[]>("/projects", token),
      api<User[]>("/users", token),
    ])
      .then(([activeUser, projectList, userList]) => {
        if (!active) return;
        setUser(activeUser);
        localStorage.setItem(DEMO_USER, JSON.stringify(activeUser));
        setProjects(projectList);
        setProject((current) =>
          projectList.find((item) => item.id === current?.id) ?? projectList[0] ?? null,
        );
        setUsers(userList);
      })
      .catch((issue: unknown) => {
        if (!active) return;
        if (issue instanceof Error && "status" in issue && issue.status === 401) {
          signOut();
        } else {
          setError(issue instanceof Error ? issue.message : "Couldn't load your workspace.");
        }
      });
    return () => { active = false; };
  }, [token]);

  useEffect(() => {
    if (!token || !project) {
      setPageData(null);
      return;
    }
    let active = true;
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined && value !== "") params.set(key, String(value));
    }
    setLoading(true);
    setError("");
    api<IssuePage>(`/projects/${project.id}/issues?${params}`, token)
      .then((result) => { if (active) setPageData(result); })
      .catch((issue: unknown) => {
        if (active) setError(issue instanceof Error ? issue.message : "Couldn't load issues.");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token, project, filters]);

  useEffect(() => {
    if (!token || !project) return;
    let active = true;
    api<ProjectMember[]>(`/projects/${project.id}/members`, token)
      .then((result) => { if (active) setMembers(result); })
      .catch((issue: unknown) => { if (active) setError(issue instanceof Error ? issue.message : "Couldn't load members."); });
    return () => { active = false; };
  }, [token, project]);

  function signOut() {
    localStorage.removeItem(DEMO_TOKEN);
    localStorage.removeItem(DEMO_USER);
    setToken(null);
    setUser(null);
    setProject(null);
    setProjects([]);
    setSelectedIssue(null);
  }

  function handleLogin(newToken: string, newUser: User) {
    localStorage.setItem(DEMO_TOKEN, newToken);
    localStorage.setItem(DEMO_USER, JSON.stringify(newUser));
    setToken(newToken);
    setUser(newUser);
  }

  async function refreshIssues() {
    if (!token || !project) return;
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined && value !== "") params.set(key, String(value));
    }
    const result = await api<IssuePage>(`/projects/${project.id}/issues?${params}`, token);
    setPageData(result);
  }

  async function saveIssue(issueId: number, patch: Record<string, unknown>) {
    if (!token) return;
    const updated = await api<Issue>(`/issues/${issueId}`, token, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
    setSelectedIssue((current) =>
      current ? { ...updated, projectKey: current.projectKey } : updated,
    );
    await refreshIssues();
  }

  async function createIssue(input: Record<string, unknown>) {
    if (!token || !project) return;
    const created = await api<Issue>(`/projects/${project.id}/issues`, token, {
      method: "POST",
      body: JSON.stringify(input),
    });
    setModal(null);
    setFilters((current) => ({ ...current, page: 1 }));
    await refreshIssues();
    setSelectedIssue({ ...created, projectKey: project.key });
  }

  async function createProject(input: { name: string; key: string; description: string }) {
    if (!token) return;
    await api<Project>("/projects", token, { method: "POST", body: JSON.stringify(input) });
    await loadProjects();
    setModal(null);
  }

  async function addMember(username: string) {
    if (!token || !project) return;
    await api<ProjectMember>(`/projects/${project.id}/members`, token, {
      method: "POST",
      body: JSON.stringify({ username }),
    });
    const updated = await api<ProjectMember[]>(`/projects/${project.id}/members`, token);
    setMembers(updated);
    setProjects((current) =>
      current.map((item) => item.id === project.id ? { ...item, memberCount: updated.length } : item),
    );
  }

  if (!token || !user) return <Login onLogin={handleLogin} />;

  const issueCount = pageData?.summary.total ?? 0;
  const activeFilters = Boolean(filters.status || filters.priority || filters.assignee || filters.label || filters.search);

  return (
    <div className="app-shell">
      {mobileNav && <button className="mobile-backdrop" aria-label="Close navigation" onClick={() => setMobileNav(false)} />}
      <aside className={`sidebar ${mobileNav ? "sidebar-open" : ""}`}>
        <div className="sidebar-top">
          <a className="brand" href="#" onClick={(event) => event.preventDefault()}>
            <span className="brand-icon"><Command size={17} /></span> orbit
            <span className="brand-version">TEAM</span>
          </a>
          <button className="icon-button mobile-close" onClick={() => setMobileNav(false)} aria-label="Close menu"><X size={18} /></button>
          <button className="workspace-switch">
            <span className="workspace-mark">S</span>
            <span className="workspace-copy"><strong>Studio North</strong><small>Free workspace</small></span>
            <ChevronDown size={15} />
          </button>
          <div className="side-section-label">WORKSPACE</div>
          <button className="nav-link" onClick={() => setFilters({ page: 1, limit: 10, search: "" })}>
            <FolderKanban size={16} /> Issues <span className="nav-count">{issueCount}</span>
          </button>
          <button className="nav-link" onClick={() => setModal("members")}>
            <Users size={16} /> People
          </button>
          <div className="project-heading">
            <span className="side-section-label">YOUR PROJECTS</span>
            <button className="icon-button tiny" onClick={() => setModal("project")} title="Create project"><Plus size={16} /></button>
          </div>
          <div className="project-nav">
            {projects.map((item, index) => (
              <button
                key={item.id}
                className={`project-link ${project?.id === item.id ? "project-link-active" : ""}`}
                onClick={() => { setProject(item); setFilters({ page: 1, limit: 10, search: "" }); setSelectedIssue(null); setMobileNav(false); }}
              >
                <span className={`project-dot dot-${index % 4}`}>{item.key.slice(0, 1)}</span>
                <span className="project-nav-name">{item.name}</span>
                <span className="project-key">{item.key}</span>
              </button>
            ))}
            <button className="add-project-link" onClick={() => setModal("project")}><Plus size={15} /> New project</button>
          </div>
        </div>
        <div className="sidebar-bottom">
          <button className="nav-link" onClick={() => setModal("members")}><Settings2 size={16} /> Project settings</button>
          <div className="profile-card">
            <Avatar name={user.name} className="avatar-profile" />
            <span className="profile-copy"><strong>{user.name}</strong><small>@{user.username}</small></span>
            <button className="icon-button signout-button" onClick={signOut} title="Sign out"><LogOut size={15} /></button>
          </div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <button className="icon-button menu-button" onClick={() => setMobileNav(true)} aria-label="Open menu"><Menu size={19} /></button>
          <div className="breadcrumbs">
            <span>Projects</span><ChevronRight size={14} />
            <strong>{project?.name ?? "Your projects"}</strong>
          </div>
          <div className="topbar-right">
            <span className="keyboard-hint"><Command size={12} /> K</span>
            <span className="topbar-divider" />
            <button className="user-button" title={user.name}><Avatar name={user.name} /></button>
          </div>
        </header>

        <div className="page-content">
          {error && <div className="error-banner" role="alert"><span>{error}</span><button onClick={() => setError("")}><X size={15} /></button></div>}
          {!project ? (
            <section className="empty-workspace">
              <div className="empty-icon"><FolderKanban size={25} /></div>
              <span className="eyebrow">A FRESH START</span>
              <h1>Make a little room<br />for great work.</h1>
              <p>Create a project and give your team's bugs and tasks a home.</p>
              <button className="button button-primary" onClick={() => setModal("project")}><Plus size={16} /> Create a project</button>
            </section>
          ) : (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow project-eyebrow"><span className="heading-dot" /> {project.key} <span className="eyebrow-separator">/</span> PROJECT</div>
                  <h1>{project.name}<span className="heading-period">.</span></h1>
                  <p>{project.description || "A focused space for the work that matters."}</p>
                </div>
                <div className="heading-actions">
                  <button className="member-stack-button" onClick={() => setModal("members")} title="Manage project members">
                    <span className="avatar-stack">
                      {members.slice(0, 3).map((member) => <Avatar key={member.id} name={member.name} />)}
                      {members.length === 0 && <Avatar name={user.name} />}
                    </span>
                    <span className="member-total">{project.memberCount ?? (members.length || 1)}</span>
                    <ChevronDown size={14} />
                  </button>
                  <button className="button button-primary" onClick={() => setModal("issue")}><Plus size={16} /> New issue</button>
                </div>
              </div>

              <div className="metrics-strip">
                <div className="metric-item"><span className="metric-icon metric-purple"><FileText size={15} /></span><span className="metric-label">All issues</span><strong>{pageData?.summary.total ?? "—"}</strong></div>
                <div className="metric-rule" />
                <div className="metric-item"><span className="metric-icon metric-blue"><CircleDot size={15} /></span><span className="metric-label">In progress</span><strong>{pageData?.summary.inProgress ?? "—"}</strong></div>
                <div className="metric-rule" />
                <div className="metric-item"><span className="metric-icon metric-green"><CheckCircle2 size={15} /></span><span className="metric-label">Completed</span><strong>{pageData?.summary.completed ?? "—"}</strong></div>
                <div className="metric-spacer" />
                <button className="members-summary" onClick={() => setModal("members")}><Users size={15} /> {project.memberCount ?? (members.length || 1)} members <ArrowRight size={14} /></button>
              </div>

              <section className="issues-section">
                <div className="list-heading">
                  <div>
                    <h2>Issues <span className="list-count">{pageData?.pagination.total ?? 0}</span></h2>
                    <p>A shared view of everything on your plate.</p>
                  </div>
                  <div className="list-actions">
                    <label className="search-field">
                      <Search size={16} />
                      <input value={filters.search ?? ""} placeholder="Search issues…" onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value, page: 1 }))} />
                      <span className="search-shortcut">/</span>
                    </label>
                    <FilterSelect
                      label="Status"
                      value={filters.status ?? ""}
                      options={STATUSES}
                      onChange={(value) => setFilters((current) => ({ ...current, status: value, page: 1 }))}
                    />
                    <FilterSelect
                      label="Priority"
                      value={filters.priority ?? ""}
                      options={PRIORITIES}
                      onChange={(value) => setFilters((current) => ({ ...current, priority: value, page: 1 }))}
                    />
                    <FilterSelect
                      label="Assignee"
                      value={filters.assignee ?? ""}
                      options={members.map((person) => ({ value: String(person.id), label: person.name }))}
                      onChange={(value) => setFilters((current) => ({ ...current, assignee: value, page: 1 }))}
                    />
                    <FilterSelect
                      label="Label"
                      value={filters.label ?? ""}
                      options={(pageData?.availableLabels ?? []).map((label) => ({ value: label, label }))}
                      onChange={(value) => setFilters((current) => ({ ...current, label: value, page: 1 }))}
                    />
                    {activeFilters && <button className="clear-filters" onClick={() => setFilters({ page: 1, limit: 10, search: "" })}>Clear</button>}
                  </div>
                </div>
                <div className="issue-table">
                  <div className="table-header">
                    <span className="col-issue">ISSUE</span><span className="col-status">STATUS</span><span className="col-priority">PRIORITY</span><span className="col-assignee">ASSIGNEE</span><span className="col-updated">UPDATED</span>
                  </div>
                  {loading && !pageData ? (
                    <div className="table-state"><span className="loader" /> Loading issues…</div>
                  ) : pageData && pageData.issues.length > 0 ? (
                    pageData.issues.map((issue) => <IssueRow key={issue.id} issue={issue} onClick={() => setSelectedIssue(issue)} />)
                  ) : (
                    <div className="table-state empty-issues">
                      <div className="empty-icon small"><Sparkles size={19} /></div>
                      <strong>{activeFilters ? "No issues match those filters." : "A clear sky."}</strong>
                      <span>{activeFilters ? "Try changing or clearing your filters." : "Looks like everything's quiet. Add the first issue when you're ready."}</span>
                      {!activeFilters && <button className="button button-secondary" onClick={() => setModal("issue")}><Plus size={15} /> Create first issue</button>}
                    </div>
                  )}
                  {pageData && pageData.pagination.pages > 1 && (
                    <div className="pagination">
                      <span>Page {pageData.pagination.page} of {pageData.pagination.pages} <span className="pagination-total">· {pageData.pagination.total} issues</span></span>
                      <div>
                        <button className="icon-button" disabled={filters.page === 1} onClick={() => setFilters((current) => ({ ...current, page: Math.max(1, (current.page ?? 1) - 1) }))} aria-label="Previous page"><ChevronLeft size={17} /></button>
                        <button className="icon-button" disabled={(filters.page ?? 1) >= pageData.pagination.pages} onClick={() => setFilters((current) => ({ ...current, page: (current.page ?? 1) + 1 }))} aria-label="Next page"><ChevronRight size={17} /></button>
                      </div>
                    </div>
                  )}
                </div>
              </section>
              <footer className="page-footer"><span>Made for teams who care about the details.</span><span><Activity size={13} /> All systems operational</span></footer>
            </>
          )}
        </div>
      </main>

      {selectedIssue && token && (
        <IssueDetail
          key={selectedIssue.id}
          issue={selectedIssue}
          token={token}
          members={members}
          user={user}
          onClose={() => setSelectedIssue(null)}
          onSave={saveIssue}
          onError={setError}
          onChanged={refreshIssues}
        />
      )}
      {modal === "issue" && project && (
        <IssueModal project={project} members={members} onClose={() => setModal(null)} onSubmit={createIssue} />
      )}
      {modal === "project" && <ProjectModal onClose={() => setModal(null)} onSubmit={createProject} />}
      {modal === "members" && project && (
        <MembersModal
          project={project}
          members={members}
          users={users}
          currentUser={user}
          onClose={() => setModal(null)}
          onAdd={addMember}
        />
      )}
    </div>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly (string | { value: string; label: string })[];
  onChange: (value: string) => void;
}) {
  return (
    <label className={`filter-select ${value ? "filter-active" : ""}`}>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">All</option>
        {options.map((option) => {
          const item = typeof option === "string" ? { value: option, label: option } : option;
          return <option key={item.value} value={item.value}>{item.label}</option>;
        })}
      </select>
      <span>{options.map((option) => typeof option === "string" ? { value: option, label: option } : option).find((option) => option.value === value)?.label ?? label}</span>
      <ChevronDown size={13} />
    </label>
  );
}

function IssueRow({ issue, onClick }: { issue: Issue; onClick: () => void }) {
  return (
    <button className="issue-row" onClick={onClick}>
      <span className="col-issue issue-main">
        <span className={`type-icon type-${issue.type}`}>{issue.type === "bug" ? <Bug size={15} /> : <CheckCheck size={15} />}</span>
        <span className="issue-title-wrap"><span className="issue-title">{issue.title}</span><span className="issue-id">{issue.projectKey ?? "ORB"}-{issue.id}{issue.labels.slice(0, 2).map((label) => <span className="label-chip" key={label}>{label}</span>)}</span></span>
      </span>
      <span className="col-status"><StatusMark status={issue.status} /></span>
      <span className="col-priority"><PriorityMark priority={issue.priority} /></span>
      <span className="col-assignee">{issue.assigneeName ? <><Avatar name={issue.assigneeName} /><span className="assignee-name">{issue.assigneeName.split(" ")[0]}</span></> : <span className="unassigned"><Users size={14} /> Unassigned</span>}</span>
      <span className="col-updated">{formatDate(issue.updatedAt)}</span>
      <ChevronRight className="row-chevron" size={16} />
    </button>
  );
}

function ModalFrame({
  title,
  subtitle,
  onClose,
  children,
  size = "",
}: {
  title: string;
  subtitle: string;
  onClose: () => void;
  children: React.ReactNode;
  size?: string;
}) {
  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className={`modal-card ${size}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <div><h2>{title}</h2><p>{subtitle}</p></div>
          <button className="icon-button" onClick={onClose} aria-label="Close dialog"><X size={18} /></button>
        </div>
        {children}
      </section>
    </div>
  );
}

function IssueModal({
  project,
  members,
  onClose,
  onSubmit,
}: {
  project: Project;
  members: ProjectMember[];
  onClose: () => void;
  onSubmit: (input: Record<string, unknown>) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<"bug" | "task">("bug");
  const [priority, setPriority] = useState<Issue["priority"]>("Medium");
  const [assigneeId, setAssigneeId] = useState("");
  const [labels, setLabels] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await onSubmit({
        title,
        description,
        type,
        priority,
        assigneeId: assigneeId ? Number(assigneeId) : null,
        labels: labels.split(",").map((label) => label.trim()).filter(Boolean),
      });
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "Couldn't create the issue.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalFrame title="Create an issue" subtitle={`Add something to ${project.name}.`} onClose={onClose} size="issue-modal">
      <form className="modal-form" onSubmit={(event) => void submit(event)}>
        <label>Issue title<input autoFocus maxLength={160} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="What needs attention?" required /></label>
        <label>Description <span className="label-hint">Markdown supported</span><textarea rows={4} maxLength={10000} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Add context, steps to reproduce, or a definition of done…" /></label>
        <div className="form-grid">
          <label>Type<select value={type} onChange={(event) => setType(event.target.value as "bug" | "task")}><option value="bug">Bug</option><option value="task">Task</option></select></label>
          <label>Priority<select value={priority} onChange={(event) => setPriority(event.target.value as Issue["priority"])}>{PRIORITIES.map((item) => <option key={item}>{item}</option>)}</select></label>
        </div>
        <div className="form-grid">
          <label>Assignee<select value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)}><option value="">Unassigned</option>{members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label>
          <label>Labels <span className="label-hint">comma separated</span><input value={labels} onChange={(event) => setLabels(event.target.value)} placeholder="frontend, launch" /></label>
        </div>
        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions"><button type="button" className="button button-quiet" onClick={onClose}>Cancel</button><button className="button button-primary" disabled={saving || !title.trim()}><Plus size={15} /> {saving ? "Creating…" : "Create issue"}</button></div>
      </form>
    </ModalFrame>
  );
}

function ProjectModal({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (input: { name: string; key: string; description: string }) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await onSubmit({ name, key: key.toUpperCase(), description });
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "Couldn't create your project.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalFrame title="Create a project" subtitle="Give a focused piece of work a place to live." onClose={onClose}>
      <form className="modal-form" onSubmit={(event) => void submit(event)}>
        <label>Project name<input autoFocus maxLength={80} value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Mobile app" required /></label>
        <label>Project key<input maxLength={8} value={key} onChange={(event) => setKey(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} placeholder="e.g. MOB" required /><span className="label-hint">2–8 letters and numbers</span></label>
        <label>Description <span className="label-hint">optional</span><textarea rows={3} maxLength={500} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What is this project about?" /></label>
        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions"><button type="button" className="button button-quiet" onClick={onClose}>Cancel</button><button className="button button-primary" disabled={saving || !name.trim() || key.length < 2}><Plus size={15} /> {saving ? "Creating…" : "Create project"}</button></div>
      </form>
    </ModalFrame>
  );
}

function MembersModal({
  project,
  members,
  users,
  currentUser,
  onClose,
  onAdd,
}: {
  project: Project;
  members: ProjectMember[];
  users: User[];
  currentUser: User;
  onClose: () => void;
  onAdd: (username: string) => Promise<void>;
}) {
  const [username, setUsername] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const isOwner = project.role === "owner";
  const available = users.filter((person) => !members.some((member) => member.id === person.id));

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!username) return;
    setSaving(true);
    setError("");
    try {
      await onAdd(username);
      setUsername("");
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "Couldn't add this member.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalFrame title="Project members" subtitle={`The people working on ${project.name}.`} onClose={onClose}>
      <div className="member-list">
        {members.map((member) => (
          <div className="member-row" key={member.id}>
            <Avatar name={member.name} />
            <span className="member-row-copy"><strong>{member.name}{member.id === currentUser.id ? " (you)" : ""}</strong><small>@{member.username}</small></span>
            <span className={`role-pill ${member.role}`}>{member.role === "owner" ? "Owner" : "Member"}</span>
          </div>
        ))}
        {members.length === 0 && <p className="muted-copy">Loading project members…</p>}
      </div>
      {isOwner && available.length > 0 && (
        <form className="add-member-form" onSubmit={(event) => void submit(event)}>
          <label>Add a teammate</label>
          <div className="add-member-row">
            <select value={username} onChange={(event) => setUsername(event.target.value)} required>
              <option value="">Choose a teammate</option>
              {available.map((person) => <option key={person.id} value={person.username}>{person.name} (@{person.username})</option>)}
            </select>
            <button className="button button-primary" disabled={saving || !username}>{saving ? "Adding…" : "Add member"}</button>
          </div>
          {error && <p className="form-error">{error}</p>}
        </form>
      )}
      <div className="modal-actions"><button className="button button-secondary" onClick={onClose}>Done</button></div>
    </ModalFrame>
  );
}

function IssueDetail({
  issue: initialIssue,
  token,
  members,
  user,
  onClose,
  onSave,
  onError,
  onChanged,
}: {
  issue: Issue;
  token: string;
  members: ProjectMember[];
  user: User;
  onClose: () => void;
  onSave: (id: number, patch: Record<string, unknown>) => Promise<void>;
  onError: (message: string) => void;
  onChanged: () => Promise<void>;
}) {
  const [issue, setIssue] = useState(initialIssue);
  const [tab, setTab] = useState<"comments" | "history">("comments");
  const [comments, setComments] = useState<Comment[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [edit, setEdit] = useState({ title: issue.title, description: issue.description, priority: issue.priority, type: issue.type, assigneeId: issue.assigneeId ? String(issue.assigneeId) : "", labels: issue.labels.join(", ") });

  const loadActivity = useCallback(async () => {
    try {
      const [commentList, historyList] = await Promise.all([
        api<Comment[]>(`/issues/${issue.id}/comments`, token),
        api<HistoryEntry[]>(`/issues/${issue.id}/history`, token),
      ]);
      setComments(commentList);
      setHistory(historyList);
    } catch (error) {
      onError(error instanceof Error ? error.message : "Couldn't load issue activity.");
    }
  }, [issue.id, onError, token]);

  useEffect(() => { void loadActivity(); }, [loadActivity]);

  const availableStatuses = useMemo(() => {
    const next = STATUSES[STATUSES.indexOf(issue.status) + 1];
    return issue.status === "Closed" ? ["Open"] : next ? [next] : [];
  }, [issue.status]);

  async function changeStatus(status: string) {
    try {
      await onSave(issue.id, { status });
      setIssue((current) => ({ ...current, status: status as Issue["status"] }));
      await loadActivity();
    } catch (error) {
      onError(error instanceof Error ? error.message : "Couldn't update the workflow.");
    }
  }

  async function saveDetails(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await onSave(issue.id, {
        title: edit.title,
        description: edit.description,
        priority: edit.priority,
        type: edit.type,
        assigneeId: edit.assigneeId ? Number(edit.assigneeId) : null,
        labels: edit.labels.split(",").map((label) => label.trim()).filter(Boolean),
      });
      setIssue((current) => ({
        ...current,
        ...edit,
        assigneeId: edit.assigneeId ? Number(edit.assigneeId) : null,
        labels: edit.labels.split(",").map((label) => label.trim()).filter(Boolean),
      }));
      setEditMode(false);
      await loadActivity();
    } catch (error) {
      onError(error instanceof Error ? error.message : "Couldn't update this issue.");
    } finally {
      setSaving(false);
    }
  }

  async function postComment(event: FormEvent) {
    event.preventDefault();
    if (!comment.trim()) return;
    setSaving(true);
    try {
      await api<Comment>(`/issues/${issue.id}/comments`, token, {
        method: "POST",
        body: JSON.stringify({ body: comment }),
      });
      setComment("");
      await loadActivity();
      await onChanged();
    } catch (error) {
      onError(error instanceof Error ? error.message : "Couldn't post your comment.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="detail-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <aside className="detail-panel" role="dialog" aria-modal="true" aria-label={issue.title}>
        <div className="detail-toolbar">
          <span className="detail-breadcrumb"><Hash size={14} /> {issue.projectKey ?? "ORB"}-{issue.id}</span>
          <div><button className="icon-button" onClick={onClose} aria-label="Close issue"><X size={18} /></button></div>
        </div>
        <div className="detail-scroll">
          <div className="detail-kicker">{issue.type === "bug" ? <Bug size={15} /> : <CheckCheck size={15} />} {issue.type} <span>·</span> created by {issue.creatorName ?? user.name}</div>
          {editMode ? (
            <form className="detail-edit-form" onSubmit={(event) => void saveDetails(event)}>
              <label>Title<input maxLength={160} value={edit.title} onChange={(event) => setEdit({ ...edit, title: event.target.value })} required /></label>
              <label>Description<textarea rows={8} value={edit.description} onChange={(event) => setEdit({ ...edit, description: event.target.value })} /></label>
              <label>Type<select value={edit.type} onChange={(event) => setEdit({ ...edit, type: event.target.value as "bug" | "task" })}><option value="bug">Bug</option><option value="task">Task</option></select></label>
              <label>Priority<select value={edit.priority} onChange={(event) => setEdit({ ...edit, priority: event.target.value as Issue["priority"] })}>{PRIORITIES.map((priority) => <option key={priority}>{priority}</option>)}</select></label>
              <label>Assignee<select value={edit.assigneeId} onChange={(event) => setEdit({ ...edit, assigneeId: event.target.value })}><option value="">Unassigned</option>{members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label>
              <label>Labels <span className="label-hint">comma separated</span><input value={edit.labels} onChange={(event) => setEdit({ ...edit, labels: event.target.value })} /></label>
              <div className="modal-actions"><button type="button" className="button button-quiet" onClick={() => setEditMode(false)}>Cancel</button><button className="button button-primary" disabled={saving || !edit.title.trim()}>{saving ? "Saving…" : "Save changes"}</button></div>
            </form>
          ) : (
            <>
              <h1 className="detail-title">{issue.title}</h1>
              <div className="detail-controls">
                <div className="detail-status-select"><StatusMark status={issue.status} /><ChevronDown size={13} /><select aria-label="Change issue status" value="" onChange={(event) => { if (event.target.value) void changeStatus(event.target.value); }}><option value="">Move to…</option>{availableStatuses.map((status) => <option key={status}>{status}</option>)}</select></div>
                <button className="button button-quiet edit-button" onClick={() => setEditMode(true)}><Settings2 size={14} /> Edit</button>
              </div>
              <div className="detail-properties">
                <div><span>Priority</span><PriorityMark priority={issue.priority} /></div>
                <div><span>Assignee</span>{issue.assigneeName ? <span className="detail-assignee"><Avatar name={issue.assigneeName} />{issue.assigneeName}</span> : <span className="unassigned">Unassigned</span>}</div>
                <div><span>Labels</span><span className="detail-labels">{issue.labels.length ? issue.labels.map((label) => <span className="label-chip" key={label}>{label}</span>) : <span className="muted-copy">None</span>}</span></div>
                <div><span>Created</span><span>{formatDate(issue.createdAt)}</span></div>
              </div>
              <div className="detail-description">
                <div className="detail-section-title">Description</div>
                {issue.description ? <div className="markdown-body"><ReactMarkdown>{issue.description}</ReactMarkdown></div> : <p className="muted-copy">No description yet.</p>}
              </div>
            </>
          )}

          <div className="activity-section">
            <div className="activity-tabs">
              <button className={tab === "comments" ? "active" : ""} onClick={() => setTab("comments")}><MessageCircle size={15} /> Comments <span>{comments.length}</span></button>
              <button className={tab === "history" ? "active" : ""} onClick={() => setTab("history")}><History size={15} /> History <span>{history.length}</span></button>
            </div>
            {tab === "comments" ? (
              <div className="comment-thread">
                {comments.length === 0 && <div className="activity-empty"><MessageCircle size={18} /><span>No comments just yet.<br />Start the conversation.</span></div>}
                {comments.map((item) => <article className="comment-item" key={item.id}><Avatar name={item.authorName ?? "Teammate"} /><div className="comment-content"><div className="comment-meta"><strong>{item.authorName ?? "Teammate"}</strong><span>{formatDate(item.createdAt)}</span></div><p>{item.body}</p></div></article>)}
                <form className="comment-form" onSubmit={(event) => void postComment(event)}>
                  <Avatar name={user.name} />
                  <div className="comment-compose"><textarea value={comment} onChange={(event) => setComment(event.target.value)} maxLength={5000} rows={2} placeholder="Leave a thoughtful comment…" /><div><span>Be kind. Be specific.</span><button className="button button-primary button-small" disabled={saving || !comment.trim()}>Comment <ArrowRight size={13} /></button></div></div>
                </form>
              </div>
            ) : (
              <div className="history-list">
                {history.length === 0 && <div className="activity-empty"><History size={18} /><span>No changes recorded yet.</span></div>}
                {history.map((entry) => (
                  <div className="history-item" key={entry.id}>
                    <span className="history-dot"><Activity size={12} /></span>
                    <div><p><strong>{entry.actorName ?? "A teammate"}</strong> changed <strong>{entry.fieldName.replaceAll("_", " ")}</strong></p><div className="history-values"><ValueChip value={entry.oldValue} /> <ArrowRight size={12} /> <ValueChip value={entry.newValue} /></div><time>{formatDate(entry.changedAt)}</time></div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}

function ValueChip({ value }: { value: unknown }) {
  let text: string;
  if (value === null || value === undefined) text = "empty";
  else if (Array.isArray(value)) text = value.length ? value.join(", ") : "none";
  else if (typeof value === "object") text = JSON.stringify(value);
  else text = String(value).replaceAll('"', "");
  return <span className="history-value">{text}</span>;
}

export default App;
