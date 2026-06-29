# Settings Guide

This guide covers all settings pages available in the Spernakit admin interface at `/settings`.

Settings are organized into tabs in a horizontal navigation bar. Access requires authentication; some tabs require elevated roles.

---

## Application

**Route:** `/settings/application`
**Required Role:** ADMIN or higher

Configure the application's identity and branding.

**Fields:**

| Field            | Description                                                      |
| ---------------- | ---------------------------------------------------------------- |
| Application Name | Display name shown in the sidebar, browser title, and login page |
| Description      | Brief description of the application                             |

Changes take effect immediately after saving. The save button is disabled until a field is modified.

---

## Authentication

**Route:** `/settings/authentication`
**Required Role:** SYSOP only

Configure password policies and account lockout rules. Non-SYSOP users see a read-only notice.

### Account Lockout

| Field                      | Range  | Default | Description                                |
| -------------------------- | ------ | ------- | ------------------------------------------ |
| Enable Account Lockout     | Toggle | On      | Lock accounts after repeated failed logins |
| Max Failed Login Attempts  | 1-100  | 5       | Number of failed attempts before lockout   |
| Lockout Duration (minutes) | 1-1440 | 15      | How long accounts remain locked            |

The lockout duration and max attempts fields only appear when account lockout is enabled.

### Password Policy

| Field                         | Range  | Default | Description                                       |
| ----------------------------- | ------ | ------- | ------------------------------------------------- |
| Password Expiry (days)        | 0-365  | 0       | Days until passwords expire (0 = never)           |
| Require Change on First Login | Toggle | Off     | Force password change after account creation      |
| Minimum Password Age (days)   | 0-365  | 0       | Minimum days before password can be changed again |

---

## Users

**Route:** `/settings/users`
**Required Role:** ADMIN or higher

Manage all system users with a searchable, paginated data table.

### User Table Columns

| Column     | Description                                             |
| ---------- | ------------------------------------------------------- |
| Username   | User's login name                                       |
| Email      | Email address                                           |
| Role       | Assigned role (SYSOP, ADMIN, MANAGER, OPERATOR, VIEWER) |
| Status     | Active or inactive (shown as a badge)                   |
| Created    | Account creation date                                   |
| Last Login | Most recent login timestamp                             |
| Actions    | Edit and Delete options via dropdown menu               |

### Filtering

- **Search:** Filter by username or email (text input)
- **Role filter:** Show only users with a specific role (dropdown)

Both filters reset pagination to page 1.

### Creating a User

Click the **Create User** button (bottom-right). Required fields:

| Field    | Requirements                     |
| -------- | -------------------------------- |
| Username | Unique, required                 |
| Email    | Valid email, required            |
| Password | Minimum 8 characters             |
| Role     | Select from the 5-tier hierarchy |

### Editing and Deleting

Use the actions dropdown on each table row to edit user details or delete the account (with confirmation dialog).

---

## Roles

**Route:** `/settings/roles`
**Required Role:** ADMIN or higher

Read-only reference page displaying the 5-tier role hierarchy and current user distribution.

### Role Hierarchy

```
SYSOP (Level 5) > ADMIN (Level 4) > MANAGER (Level 3) > OPERATOR (Level 2) > VIEWER (Level 1)
```

Each higher role inherits all permissions from lower roles.

### Role Details

| Role     | Scope          | Key Permissions                                                           |
| -------- | -------------- | ------------------------------------------------------------------------- |
| SYSOP    | Full system    | Cross-workspace visibility, system configuration, all audit logs          |
| ADMIN    | Workspace-wide | User management, app settings, audit logs, workspace management           |
| MANAGER  | Team-level     | Workspace member management, role assignment within workspace             |
| OPERATOR | Task-level     | Create/edit records, file uploads, view health details                    |
| VIEWER   | Read-only      | Dashboard access, own notifications, profile updates, read workspace data |

Each role card shows the current count of users assigned to that role.

---

## Notifications

**Route:** `/settings/notifications`
**Required Role:** Any authenticated user

View notification delivery settings and manage your personal notification preferences. Notification preferences are per-user -- each user configures their own delivery channels independently.

### Notification Delivery

| Channel             | Status  |
| ------------------- | ------- |
| Email notifications | Enabled |
| Push notifications  | Enabled |
| System alerts       | Enabled |

### Retention Policy

| Setting                     | Value   |
| --------------------------- | ------- |
| Read notification retention | 90 days |
| Deleted notification purge  | 30 days |

### Default Preferences

Shows which notification types are enabled by default for new users. Individual users can override these in their profile preferences.

---

## Email

**Route:** `/settings/email`
**Required Role:** SYSOP for configuration; any authenticated user can send test emails

Configure SMTP email delivery and verify it works with a test email.

### Status Card

Displays the current SMTP configuration status and the result of the last test email (success/failed with timestamp).

### SMTP Configuration (SYSOP only)

| Field         | Required | Description                                     |
| ------------- | -------- | ----------------------------------------------- |
| SMTP Host     | Yes      | Mail server hostname (e.g., `smtp.gmail.com`)   |
| SMTP Port     | Yes      | Mail server port (default: 587, range: 1-65535) |
| Use SSL/TLS   | No       | Toggle encryption (enable for port 465)         |
| SMTP Username | Yes      | Authentication username                         |
| SMTP Password | Yes      | Authentication password (stored encrypted)      |
| From Email    | Yes      | Sender email address                            |
| From Name     | No       | Sender display name                             |

### Test Email

After configuring SMTP, send a test email to verify delivery:

| Field           | Required | Description            |
| --------------- | -------- | ---------------------- |
| Recipient Email | Yes      | Where to send the test |
| Subject         | No       | Custom subject line    |
| Message         | No       | Custom message body    |

The test form is disabled until SMTP is configured. All configuration changes are recorded in the audit trail.

---

## System Health

**Route:** `/settings/system-health`
**Required Role:** OPERATOR or higher

Monitor system health, configure thresholds, run manual checks, and review historical metrics.

### Health Check Configuration

| Field                      | Description                                                   |
| -------------------------- | ------------------------------------------------------------- |
| Memory Unhealthy Threshold | Heap usage percentage that triggers unhealthy status (0-100%) |
| Memory Degraded Threshold  | Heap usage percentage that triggers degraded status (0-100%)  |
| Log Retention (days)       | How long health check logs are kept (minimum 1 day)           |
| Database Check             | Toggle database connectivity monitoring                       |
| Memory Check               | Toggle memory usage monitoring                                |
| Filesystem Check           | Toggle filesystem availability monitoring                     |

### Health Checks

Lists each enabled check with its current status. Click **Run** to manually trigger an individual check.

### Active Alerts

Shows unresolved health alerts that need attention. Alerts can be acknowledged and resolved.

### Cleanup

| Action         | Description                                             |
| -------------- | ------------------------------------------------------- |
| Cleanup Logs   | Purge health check logs older than the retention period |
| Cleanup Alerts | Purge resolved alerts older than the retention period   |

### Resource Trends

Select a time range to view historical CPU and memory usage charts. Use the **Refresh** button at the top to update all data.

---

## Backup

**Route:** `/settings/backup`
**Required Role:** ADMIN or higher (SYSOP required for restore)

Manage database backups and restore operations.

### Create Backup

Click the **Create Backup** button to trigger a new database backup. The backup includes all application data and is saved to the `backups/` directory.

### Backup List

| Column   | Description                         |
| -------- | ----------------------------------- |
| Filename | Backup file name with timestamp     |
| Size     | Backup file size                    |
| Created  | Date and time the backup was made   |
| Actions  | Download or restore from the backup |

### Actions

- **Download**: Download a backup file to your local machine
- **Restore** (SYSOP only): Restore the database from a selected backup. A confirmation dialog is shown before restoring, as this operation replaces the current database.

---

## Scheduled Tasks

**Route:** `/settings/scheduled-tasks`
**Required Role:** ADMIN or higher

View and manage background scheduled tasks.

### Task List

Each task is displayed as a card showing:

| Field     | Description                                 |
| --------- | ------------------------------------------- |
| Task Name | Name of the scheduled task                  |
| Status    | Enabled or Disabled (badge)                 |
| Schedule  | Cron expression defining when the task runs |
| Last Run  | Timestamp of most recent execution          |
| Duration  | Execution time in milliseconds              |
| Result    | Success, running, or failed (with icon)     |

### Actions

| Action  | Description                                                              |
| ------- | ------------------------------------------------------------------------ |
| Trigger | Manually execute the task immediately                                    |
| History | View up to 20 recent executions with status, duration, and error details |

Failed executions display the error message in the history panel. Toast notifications confirm successful triggers.

---

## Audit Logs

**Route:** `/settings/audit-logs`
**Required Role:** SYSOP sees all logs; ADMIN sees workspace-scoped logs

Search and review all system activity logs for security auditing and troubleshooting.

### Search

Enter text to filter by action, resource, or username. Press Enter or click Search. Click **Clear** to reset the search and pagination.

### Log Table

| Column     | Description                                                           |
| ---------- | --------------------------------------------------------------------- |
| Expand     | Click to reveal full JSON details of the event                        |
| Timestamp  | When the action occurred                                              |
| User       | Who performed the action (or "System" for automated events)           |
| Action     | HTTP method (POST/PUT/PATCH/DELETE) with color coding + endpoint path |
| Resource   | Resource type and ID affected                                         |
| IP Address | Client IP address for the request                                     |

### Action Color Coding

| Method | Color             | Meaning                   |
| ------ | ----------------- | ------------------------- |
| POST   | Default           | Resource creation         |
| PUT    | Secondary         | Full resource replacement |
| PATCH  | Secondary         | Partial update            |
| DELETE | Destructive (red) | Resource deletion         |

### Expanded Details

Click the expand chevron on any row to see the full JSON payload, including before/after values for mutations.

Pagination supports configurable page sizes. Results are sorted by most recent first.
