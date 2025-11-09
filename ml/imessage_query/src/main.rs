use std::fs;
use std::path::Path;
use std::time::SystemTime;

use anyhow::{anyhow, Result};
use chrono::{DateTime, TimeZone, Utc};
use clap::{Parser, Subcommand};
use imessage_database::{
    tables::{
        messages::Message,
        table::{get_connection, Table},
    },
    util::dirs::default_db_path,
};
use rusqlite::{params, params_from_iter, Connection, OptionalExtension};
use serde::Serialize;
use tracing_subscriber::EnvFilter;

const CLI_VERSION: &str = env!("CARGO_PKG_VERSION");

#[derive(Parser)]
#[command(author, version, about = "Query the iMessage chat database and output structured JSON", long_about = None)]
struct Cli {
    /// Enable verbose logging
    #[arg(short, long, global = true)]
    verbose: bool,

    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Output high-level statistics about the database
    Stats,
    /// Fetch unread messages sorted by newest first
    Unread {
        /// Maximum number of messages to return
        #[arg(short, long, default_value_t = 25)]
        limit: usize,
    },
    /// Fetch most recent conversations
    Conversations {
        /// Maximum number of conversations to return
        #[arg(short, long, default_value_t = 25)]
        limit: usize,
        /// Include conversations that do not yet have any messages
        #[arg(long, default_value_t = false)]
        include_empty: bool,
    },
    /// Fetch messages for a specific chat (conversation)
    Messages {
        /// Chat rowid (from chat table)
        #[arg(long, conflicts_with = "chat_guid")]
        chat_id: Option<i64>,
        /// Chat GUID (e.g. iMessage;-;GUID)
        #[arg(long, conflicts_with = "chat_id")]
        chat_guid: Option<String>,
        /// Maximum number of messages to return
        #[arg(short, long, default_value_t = 50)]
        limit: usize,
        /// Only include messages before this mac absolute timestamp (nanoseconds)
        #[arg(long)]
        before: Option<i64>,
        /// Only include messages after this mac absolute timestamp (nanoseconds)
        #[arg(long)]
        after: Option<i64>,
        /// Sort oldest first instead of newest first
        #[arg(long, default_value_t = false)]
        ascending: bool,
    },
}

#[derive(Serialize)]
struct ResponseEnvelope<T> {
    version: &'static str,
    generated_at: String,
    data: T,
}

#[derive(Serialize)]
struct StatsOutput {
    total_messages: i64,
    sent_messages: i64,
    received_messages: i64,
    unread_messages: i64,
    chats: i64,
    attachments: i64,
    attachments_bytes: i64,
    database_size_bytes: u64,
}

#[derive(Serialize, Clone)]
struct TimestampOutput {
    raw_ns: i64,
    unix_epoch_ms: Option<i64>,
    iso8601: Option<String>,
}

#[derive(Serialize, Clone)]
struct AttachmentOutput {
    id: i64,
    guid: String,
    mime_type: Option<String>,
    uti: Option<String>,
    filename: Option<String>,
    total_bytes: Option<i64>,
    is_sticker: bool,
}

#[derive(Serialize, Clone)]
struct ReactionOutput {
    guid: String,
    from: Option<String>,
    is_from_me: bool,
    reaction_type: Option<i32>,
    reaction_label: Option<String>,
    date: TimestampOutput,
}

#[derive(Serialize, Clone)]
struct MessageOutput {
    id: i64,
    guid: String,
    chat_id: Option<i64>,
    service: Option<String>,
    is_from_me: bool,
    is_read: bool,
    has_attachments: bool,
    handle_id: Option<i64>,
    handle_identifier: Option<String>,
    item_type: i32,
    text: Option<String>,
    subject: Option<String>,
    date: TimestampOutput,
    date_read: Option<TimestampOutput>,
    date_delivered: Option<TimestampOutput>,
    associated_message_guid: Option<String>,
    associated_message_type: Option<i32>,
    thread_originator_guid: Option<String>,
    thread_originator_part: Option<String>,
    associated_message_emoji: Option<String>,
    replies_count: i64,
    attachments: Vec<AttachmentOutput>,
    reactions: Vec<ReactionOutput>,
}

#[derive(Serialize)]
struct ConversationOutput {
    id: i64,
    guid: String,
    chat_identifier: Option<String>,
    display_name: Option<String>,
    service: Option<String>,
    unread_count: i64,
    last_activity: Option<TimestampOutput>,
    participants: Vec<String>,
    last_message: Option<MessageOutput>,
}

fn main() {
    if let Err(err) = run() {
        let escaped = serde_json::to_string(&err.to_string())
            .unwrap_or_else(|_| "\"unknown error\"".to_string());
        eprintln!("{{\"success\":false,\"error\":{}}}", escaped);
        std::process::exit(1);
    }
}

fn run() -> Result<()> {
    let cli = Cli::parse();

    init_tracing(cli.verbose)?;

    let db_path = default_db_path();
    let conn = get_connection(&db_path).map_err(|e| anyhow!(e.to_string()))?;

    match cli.command {
        Commands::Stats => {
            let stats = gather_stats(&conn, &db_path)?;
            emit_json(stats)?;
        }
        Commands::Unread { limit } => {
            let messages = fetch_unread_messages(&conn, limit)?;
            emit_json(messages)?;
        }
        Commands::Conversations {
            limit,
            include_empty,
        } => {
            let conversations = fetch_conversations(&conn, limit, include_empty)?;
            emit_json(conversations)?;
        }
        Commands::Messages {
            chat_id,
            chat_guid,
            limit,
            before,
            after,
            ascending,
        } => {
            let selector = match (chat_id, chat_guid) {
                (Some(id), _) => ChatSelector::ById(id),
                (None, Some(guid)) => ChatSelector::ByGuid(guid),
                (None, None) => {
                    return Err(anyhow!(
                        "messages command requires either --chat-id or --chat-guid"
                    ));
                }
            };

            let messages =
                fetch_messages_for_chat(&conn, selector, limit, before, after, ascending)?;
            emit_json(messages)?;
        }
    }

    Ok(())
}

fn emit_json<T: Serialize>(data: T) -> Result<()> {
    let envelope = ResponseEnvelope {
        version: CLI_VERSION,
        generated_at: current_iso8601(),
        data,
    };

    let stdout = serde_json::to_string_pretty(&envelope)?;
    println!("{}", stdout);
    Ok(())
}

fn init_tracing(verbose: bool) -> Result<()> {
    let filter = if verbose {
        EnvFilter::new("imessage_query=debug")
    } else {
        EnvFilter::new("imessage_query=info")
    };

    tracing_subscriber::fmt()
        .with_env_filter(filter)
        .with_writer(std::io::stderr)
        .try_init()
        .ok();

    Ok(())
}

fn current_iso8601() -> String {
    DateTime::<Utc>::from(SystemTime::now()).to_rfc3339()
}

fn timestamp_output(mac_absolute_ns: i64) -> Option<TimestampOutput> {
    if mac_absolute_ns <= 0 {
        return None;
    }

    let unix_ms = mac_absolute_ns / 1_000_000 + 978_307_200_000;
    let iso8601 = format_iso(unix_ms);

    Some(TimestampOutput {
        raw_ns: mac_absolute_ns,
        unix_epoch_ms: Some(unix_ms),
        iso8601,
    })
}

fn format_iso(unix_ms: i64) -> Option<String> {
    let secs = unix_ms / 1000;
    let millis = (unix_ms % 1000) as u32;
    Utc.timestamp_opt(secs, millis * 1_000_000)
        .single()
        .map(|dt| dt.to_rfc3339())
}

fn gather_stats(conn: &Connection, db_path: &Path) -> Result<StatsOutput> {
    let total_messages: i64 =
        conn.query_row("SELECT COUNT(*) FROM message", [], |row| row.get(0))?;
    let sent_messages: i64 = conn.query_row(
        "SELECT COUNT(*) FROM message WHERE is_from_me = 1",
        [],
        |row| row.get(0),
    )?;
    let unread_messages: i64 = conn.query_row(
        "SELECT COUNT(*) FROM message WHERE is_read = 0 AND is_from_me = 0 AND is_system_message = 0",
        [],
        |row| row.get(0),
    )?;
    let chats: i64 = conn.query_row("SELECT COUNT(*) FROM chat", [], |row| row.get(0))?;
    let attachments: i64 =
        conn.query_row("SELECT COUNT(*) FROM attachment", [], |row| row.get(0))?;
    let attachments_bytes: i64 = conn.query_row(
        "SELECT IFNULL(SUM(total_bytes), 0) FROM attachment",
        [],
        |row| row.get(0),
    )?;

    let metadata = fs::metadata(db_path).map_err(|e| anyhow!(e.to_string()))?;

    Ok(StatsOutput {
        total_messages,
        sent_messages,
        received_messages: total_messages - sent_messages,
        unread_messages,
        chats,
        attachments,
        attachments_bytes,
        database_size_bytes: metadata.len(),
    })
}

fn fetch_unread_messages(conn: &Connection, limit: usize) -> Result<Vec<MessageOutput>> {
    let mut stmt = conn.prepare(
        r#"
        SELECT
            m.*,
            cm.chat_id,
            (
                SELECT COUNT(*) FROM message_attachment_join a WHERE a.message_id = m.ROWID
            ) AS num_attachments,
            CAST(NULL AS INTEGER) AS deleted_from,
            (
                SELECT COUNT(*) FROM message r WHERE r.thread_originator_guid = m.guid
            ) AS num_replies
        FROM message m
        LEFT JOIN chat_message_join cm ON m.ROWID = cm.message_id
        WHERE m.is_read = 0
          AND m.is_from_me = 0
          AND m.item_type = 0
          AND m.is_system_message = 0
        ORDER BY m.date DESC
        LIMIT ?1
        "#,
    )?;

    let rows = stmt.query_map(params![limit as i64], |row| Ok(Message::from_row(row)))?;
    let mut messages = Vec::new();

    for row in rows {
        let nested = row?;
        let mut message = Message::extract(Ok(nested)).map_err(|e| anyhow!(e.to_string()))?;
        messages.push(message_to_output(conn, &mut message)?);
    }

    Ok(messages)
}

fn fetch_conversations(
    conn: &Connection,
    limit: usize,
    include_empty: bool,
) -> Result<Vec<ConversationOutput>> {
    let mut stmt = conn.prepare(
        r#"
        SELECT
            c.ROWID,
            c.guid,
            c.chat_identifier,
            c.display_name,
            c.service_name,
            (
                SELECT MAX(m.date)
                FROM message m
                INNER JOIN chat_message_join cm2 ON m.ROWID = cm2.message_id
                WHERE cm2.chat_id = c.ROWID
            ) AS last_activity,
            (
                SELECT COUNT(*)
                FROM message m
                INNER JOIN chat_message_join cm3 ON m.ROWID = cm3.message_id
                WHERE cm3.chat_id = c.ROWID
                  AND m.is_read = 0
                  AND m.is_from_me = 0
                  AND m.is_system_message = 0
            ) AS unread_count
        FROM chat c
        WHERE (?1 = 1)
           OR EXISTS (
                SELECT 1 FROM chat_message_join cm
                WHERE cm.chat_id = c.ROWID
            )
        ORDER BY last_activity DESC
        LIMIT ?2
        "#,
    )?;

    let include_empty_flag = if include_empty { 1 } else { 0 };
    let rows = stmt.query_map(params![include_empty_flag, limit as i64], |row| {
        let id: i64 = row.get(0)?;
        let guid: String = row.get(1)?;
        let chat_identifier: Option<String> = row.get(2)?;
        let display_name: Option<String> = row.get(3)?;
        let service: Option<String> = row.get(4)?;
        let last_activity_raw: Option<i64> = row.get(5)?;
        let unread_count: i64 = row.get(6)?;

        Ok((
            id,
            guid,
            chat_identifier,
            display_name,
            service,
            last_activity_raw,
            unread_count,
        ))
    })?;

    let mut conversations = Vec::new();
    for row in rows {
        let (
            chat_id,
            guid,
            chat_identifier,
            display_name,
            service,
            last_activity_raw,
            unread_count,
        ) = row?;
        let participants = fetch_participants(conn, chat_id)?;
        let last_message =
            fetch_messages_for_chat(conn, ChatSelector::ById(chat_id), 1, None, None, false)?
                .into_iter()
                .next();

        let last_activity = last_activity_raw.and_then(timestamp_output);

        conversations.push(ConversationOutput {
            id: chat_id,
            guid,
            chat_identifier,
            display_name,
            service,
            unread_count,
            last_activity,
            participants,
            last_message,
        });
    }

    Ok(conversations)
}

fn fetch_messages_for_chat(
    conn: &Connection,
    selector: ChatSelector,
    limit: usize,
    before: Option<i64>,
    after: Option<i64>,
    ascending: bool,
) -> Result<Vec<MessageOutput>> {
    let chat_id = resolve_chat_rowid(conn, &selector)?;
    let mut query = String::from(BASE_CHAT_QUERY);
    let mut params_list: Vec<i64> = vec![chat_id];

    if let Some(before_val) = before {
        query.push_str(" AND m.date < ?");
        params_list.push(before_val);
    }
    if let Some(after_val) = after {
        query.push_str(" AND m.date > ?");
        params_list.push(after_val);
    }

    query.push_str(" ORDER BY m.date ");
    query.push_str(if ascending { "ASC" } else { "DESC" });
    query.push_str(" LIMIT ?");
    params_list.push(limit as i64);

    let mut stmt = conn.prepare(&query)?;
    let params_iter = params_from_iter(params_list.iter());
    let rows = stmt.query_map(params_iter, |row| Ok(Message::from_row(row)))?;

    let mut messages = Vec::new();
    for row in rows {
        let nested = row?;
        let mut message = Message::extract(Ok(nested)).map_err(|e| anyhow!(e.to_string()))?;
        messages.push(message_to_output(conn, &mut message)?);
    }

    Ok(messages)
}

enum ChatSelector {
    ById(i64),
    ByGuid(String),
}

fn resolve_chat_rowid(conn: &Connection, selector: &ChatSelector) -> Result<i64> {
    match selector {
        ChatSelector::ById(id) => Ok(*id),
        ChatSelector::ByGuid(guid) => {
            let mut stmt = conn.prepare("SELECT ROWID FROM chat WHERE guid = ?1 LIMIT 1")?;
            let rowid = stmt.query_row(params![guid], |row| row.get(0)).optional()?;

            rowid.ok_or_else(|| anyhow!(format!("No chat found with guid {guid}")))
        }
    }
}

const BASE_CHAT_QUERY: &str = "SELECT
    m.*,
    cm.chat_id,
    (SELECT COUNT(*) FROM message_attachment_join a WHERE a.message_id = m.ROWID) AS num_attachments,
    CAST(NULL AS INTEGER) AS deleted_from,
    (SELECT COUNT(*) FROM message r WHERE r.thread_originator_guid = m.guid) AS num_replies
FROM message m
INNER JOIN chat_message_join cm ON m.ROWID = cm.message_id
WHERE cm.chat_id = ?1";

fn message_to_output(conn: &Connection, message: &mut Message) -> Result<MessageOutput> {
    let rowid = message.rowid as i64;
    let guid = message.guid.clone();
    let chat_id = message.chat_id.map(|id| id as i64);
    let service = message.service.clone();
    let is_from_me = message.is_from_me;
    let is_read = message.is_read;
    let text = message.generate_text(conn).ok().map(|s| s.to_string());
    let subject = message.subject.clone();
    let date = timestamp_output(message.date).unwrap_or(TimestampOutput {
        raw_ns: 0,
        unix_epoch_ms: None,
        iso8601: None,
    });
    let date_read = timestamp_output(message.date_read);
    let date_delivered = timestamp_output(message.date_delivered);
    let associated_message_guid = message.associated_message_guid.clone();
    let associated_message_type = message.associated_message_type;
    let thread_originator_guid = message.thread_originator_guid.clone();
    let thread_originator_part = message.thread_originator_part.clone();

    let attachments = fetch_attachments(conn, rowid)?;
    let has_attachments = !attachments.is_empty();
    let handle_id = message.handle_id.map(|id| id as i64);
    let handle_identifier = lookup_handle_identifier(conn, message.handle_id)?;
    let reactions = fetch_reactions(conn, &guid)?;
    let replies_count = message.num_replies as i64;

    Ok(MessageOutput {
        id: rowid,
        guid,
        chat_id,
        service,
        is_from_me,
        is_read,
        has_attachments,
        handle_id,
        handle_identifier,
        item_type: message.item_type,
        text,
        subject,
        date,
        date_read,
        date_delivered,
        associated_message_guid,
        associated_message_type,
        thread_originator_guid,
        thread_originator_part,
        associated_message_emoji: message.associated_message_emoji.clone(),
        replies_count,
        attachments,
        reactions,
    })
}

fn lookup_handle_identifier(conn: &Connection, handle_id: Option<i32>) -> Result<Option<String>> {
    if let Some(id) = handle_id {
        let mut stmt = conn.prepare("SELECT id FROM handle WHERE ROWID = ?1 LIMIT 1")?;
        let identifier = stmt.query_row(params![id], |row| row.get(0)).optional()?;
        Ok(identifier)
    } else {
        Ok(None)
    }
}

fn fetch_attachments(conn: &Connection, message_id: i64) -> Result<Vec<AttachmentOutput>> {
    let mut stmt = conn.prepare(
        r#"
        SELECT a.ROWID, a.guid, a.mime_type, a.uti, a.filename, a.total_bytes, a.is_sticker
        FROM attachment a
        INNER JOIN message_attachment_join maj ON maj.attachment_id = a.ROWID
        WHERE maj.message_id = ?1
        ORDER BY a.created_date ASC
        "#,
    )?;

    let rows = stmt.query_map(params![message_id], |row| {
        Ok(AttachmentOutput {
            id: row.get(0)?,
            guid: row.get(1)?,
            mime_type: row.get(2)?,
            uti: row.get(3)?,
            filename: row.get(4)?,
            total_bytes: row.get(5)?,
            is_sticker: row.get::<_, Option<i32>>(6)?.unwrap_or(0) != 0,
        })
    })?;

    let mut attachments = Vec::new();
    for row in rows {
        attachments.push(row?);
    }

    Ok(attachments)
}

fn fetch_reactions(conn: &Connection, guid: &str) -> Result<Vec<ReactionOutput>> {
    let mut stmt = conn.prepare(
        r#"
        SELECT m.guid, h.id, m.is_from_me, m.associated_message_type, m.date
        FROM message m
        LEFT JOIN handle h ON m.handle_id = h.ROWID
        WHERE m.associated_message_guid = ?1
        ORDER BY m.date ASC
        "#,
    )?;

    let rows = stmt.query_map(params![guid], |row| {
        let guid: String = row.get(0)?;
        let from: Option<String> = row.get(1)?;
        let is_from_me: bool = row.get::<_, i64>(2)? != 0;
        let reaction_type: Option<i32> = row.get(3)?;
        let date_raw: i64 = row.get(4)?;

        Ok(ReactionOutput {
            guid,
            from,
            is_from_me,
            reaction_type,
            reaction_label: reaction_type.and_then(reaction_label_from_code),
            date: timestamp_output(date_raw).unwrap_or(TimestampOutput {
                raw_ns: 0,
                unix_epoch_ms: None,
                iso8601: None,
            }),
        })
    })?;

    let mut reactions = Vec::new();
    for row in rows {
        reactions.push(row?);
    }

    Ok(reactions)
}

fn reaction_label_from_code(code: i32) -> Option<String> {
    match code {
        2000 => Some("love".to_string()),
        2001 => Some("like".to_string()),
        2002 => Some("dislike".to_string()),
        2003 => Some("laugh".to_string()),
        2004 => Some("emphasize".to_string()),
        2005 => Some("question".to_string()),
        _ => None,
    }
}

fn fetch_participants(conn: &Connection, chat_id: i64) -> Result<Vec<String>> {
    let mut stmt = conn.prepare(
        r#"
        SELECT h.id
        FROM handle h
        INNER JOIN chat_handle_join ch ON h.ROWID = ch.handle_id
        WHERE ch.chat_id = ?1
        ORDER BY h.id ASC
        "#,
    )?;

    let rows = stmt.query_map(params![chat_id], |row| row.get::<_, String>(0))?;
    let mut participants = Vec::new();
    for row in rows {
        participants.push(row?);
    }

    Ok(participants)
}
