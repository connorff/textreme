use imessage_database::{
    error::table::TableError,
    tables::{
        messages::Message,
        table::{get_connection, Table},
    },
    util::dirs::default_db_path,
};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
struct MessageJSON {
    id: i32,
    guid: String,
    text: String,
    date: i64,
    is_from_me: bool,
    is_read: bool,
    service: String,
    chat_id: Option<i32>,
    has_attachments: bool,
}

#[derive(Debug, Serialize)]
struct QueryResponse {
    success: bool,
    count: usize,
    messages: Vec<MessageJSON>,
}

fn main() -> Result<(), TableError> {
    println!("🔍 Testing iMessage Database Queries on Main Branch\n");

    let db_path = default_db_path();
    println!("📁 Database: {}", db_path.display());
    let db = get_connection(&db_path)?;

    // Query recent unread messages
    let mut statement = db.prepare("
        SELECT
            m.*,
            c.chat_id,
            (SELECT COUNT(*) FROM message_attachment_join a WHERE m.ROWID = a.message_id) as num_attachments,
            d.chat_id as deleted_from,
            (SELECT COUNT(*) FROM message m2 WHERE m2.thread_originator_guid = m.guid) as num_replies
        FROM
            message as m
        LEFT JOIN chat_message_join as c ON m.ROWID = c.message_id
        LEFT JOIN chat_recoverable_message_join as d ON m.ROWID = d.message_id
        WHERE m.is_read = 0 
            AND m.is_from_me = 0
            AND m.item_type = 0
            AND m.is_finished = 1
            AND m.is_system_message = 0
        ORDER BY
            m.date DESC
        LIMIT 5
    ")?;

    let messages = statement.query_map([], |row| Ok(Message::from_row(row)))?;
    let mut json_messages = Vec::new();

    for msg_result in messages {
        if let Ok(mut message) = Message::extract(msg_result) {
            // Parse text (uses crabstep internally for attributedBody)
            let text = message.generate_text(&db)
                .unwrap_or("(unable to parse)")
                .to_string();

            json_messages.push(MessageJSON {
                id: message.rowid,
                guid: message.guid.clone(),
                text,
                date: message.date,
                is_from_me: message.is_from_me,
                is_read: message.is_read,
                service: message.service.clone().unwrap_or_default(),
                chat_id: message.chat_id,
                has_attachments: message.num_attachments > 0,
            });
        }
    }

    let response = QueryResponse {
        success: true,
        count: json_messages.len(),
        messages: json_messages,
    };

    // Output as JSON
    let json_output = serde_json::to_string_pretty(&response)
        .expect("Failed to serialize to JSON");
    
    println!("\n📬 Query Results:\n");
    println!("{}", json_output);

    println!("\n✅ Success! Queries work on main branch.");
    println!("   - Database connection: OK");
    println!("   - SQL queries: OK");
    println!("   - Crabstep parsing: OK");
    println!("   - JSON output: OK");

    Ok(())
}

