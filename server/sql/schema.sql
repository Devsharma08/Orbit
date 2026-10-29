CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS projects (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  project_key TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  created_by BIGINT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS project_members (
  project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, user_id)
);

CREATE TABLE IF NOT EXISTS issues (
  id BIGSERIAL PRIMARY KEY,
  project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 160),
  description TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL CHECK (type IN ('bug', 'task')),
  status TEXT NOT NULL DEFAULT 'Open'
    CHECK (status IN ('Open', 'In progress', 'In review', 'Closed')),
  priority TEXT NOT NULL CHECK (priority IN ('Urgent', 'High', 'Medium', 'Low')),
  labels TEXT[] NOT NULL DEFAULT '{}',
  assignee_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_by BIGINT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS issues_project_updated_idx
  ON issues (project_id, updated_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS issues_status_idx ON issues (project_id, status);
CREATE INDEX IF NOT EXISTS issues_priority_idx ON issues (project_id, priority);

CREATE TABLE IF NOT EXISTS issue_comments (
  id BIGSERIAL PRIMARY KEY,
  issue_id BIGINT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  author_id BIGINT NOT NULL REFERENCES users(id),
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 5000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS issue_comments_issue_idx
  ON issue_comments (issue_id, created_at, id);

CREATE TABLE IF NOT EXISTS issue_history (
  id BIGSERIAL PRIMARY KEY,
  issue_id BIGINT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  actor_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  field_name TEXT NOT NULL,
  old_value JSONB,
  new_value JSONB NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS issue_history_issue_idx
  ON issue_history (issue_id, changed_at DESC, id DESC);

CREATE OR REPLACE FUNCTION record_issue_history() RETURNS TRIGGER AS $$
DECLARE
  actor BIGINT;
  field TEXT;
  previous JSONB;
  current JSONB;
BEGIN
  IF TG_OP = 'INSERT' THEN
    actor := NEW.created_by;
  ELSE
    actor := NULLIF(current_setting('app.actor_id', true), '')::BIGINT;
  END IF;

  FOREACH field IN ARRAY ARRAY[
    'title', 'description', 'type', 'status', 'priority',
    'labels', 'assignee_id'
  ] LOOP
    IF TG_OP = 'INSERT' THEN
      current := to_jsonb(NEW) -> field;
      INSERT INTO issue_history (issue_id, actor_id, field_name, old_value, new_value)
      VALUES (NEW.id, actor, field, NULL, current);
    ELSE
      previous := to_jsonb(OLD) -> field;
      current := to_jsonb(NEW) -> field;
      IF previous IS DISTINCT FROM current THEN
        INSERT INTO issue_history (issue_id, actor_id, field_name, old_value, new_value)
        VALUES (NEW.id, actor, field, previous, current);
      END IF;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION touch_issue_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS issues_history_trigger ON issues;
CREATE TRIGGER issues_history_trigger
  AFTER INSERT OR UPDATE ON issues
  FOR EACH ROW EXECUTE FUNCTION record_issue_history();

DROP TRIGGER IF EXISTS issues_updated_at_trigger ON issues;
CREATE TRIGGER issues_updated_at_trigger
  BEFORE UPDATE ON issues
  FOR EACH ROW EXECUTE FUNCTION touch_issue_updated_at();
