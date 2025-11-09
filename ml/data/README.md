# Training Data

## Parsing (updated)
- Keep unsupported messages in the prompt
    - Can we really not parse edited messages? Just use the latest version and drop the history? SOLVED, we can parse by 
    - How can we uniquely identify reacted-to messages?
    - How can we best represent unsupported message types? E.g. attachments, voice, location sharing, pay, events, etc.?
- Prepend each message with an index
- Use variable timestamps from the first message (e.g. [+2m25s], [+1h2m12s], etc.) or absolute timestamps?
    - Variable is more compact, but absolute conveys time of day, season, etc.
- Open questions:
    - Which `attributedBody` fields should we support?
        - No: rich text formatting, mentions, effects, links with rich previews, data detection (for these cases, just convert to plain text)
        - Yes: reactions and threaded replies (for these cases, annotate the message type + index of replied/reacted-to message + content)
    - Should we include any messages with `item_type != 0`? No, just regular messages
    - How do we handle multi-part messages? Just concatenate the parts and annotate the message type + index of the part

## Chat template
```text
    <|begin_of_text|><|start_header_id|>system<|end_header_id|>
    you write my next text message in my natural style. be brief when the conversation is brief; match tone, slang, casing, and emoji habits. avoid external explanations; output only the message text.<|eot_id|><|start_header_id|>user<|end_header_id|>

    [context follows, one line per message, with markers as needed]
    0 [2025-05-19 06:14:22] Rachel: [text] Hey how are you?
    1 [2025-05-19 06:14:27] Rachel: [text] Let's grab lunch sometime soon
    2 [2025-05-19 06:15:10] ME: [reaction:0] heart
    3 [2025-05-19 06:15:15] ME: [reply:2,text] Sounds great, when are you free?
    <|eot_id|><|start_header_id|>assistant<|end_header_id|>
```

## Prompt + completion pair extraction
### Prompt
- Last `n` messages before the completion
- Filter out unsupported messages as prompt

### Context notes
- Need to construct trajectories of natural language context of the relationship, `n` messages before the completion, `k` messages after the completion
- The relationship context
    - At train time: a summary of important moments, milestones, relationship insights generated from the past few months of the conversation (in memory/pipeline.py)
    - At inference time: the same summary plus potentially instructions for the model to follow, e.g. "schedule a meeting for sunday at 10am" (TODO: will instructions be too far out of training distribution? can we elicit this behavior with a more sample-efficient method using hand-labeled examples of instructions + "gold" responses, then use LLM as a judge to determine if the model is following the instructions?)
- `n` should be large enough to capture:
    - Any messages within a reasonable timeframe before the completion (TODO: what is this timeframe?)
    - Any messages replied to or reacted to by the completion, up to the following limits
- `n` should be limited to:
    - Some number of tokens before the completion (TODO: how many tokens to support in context?)
    - Before any unsupported message type (if last message is unsupported, remove the trajectory)
- `k` should include:
    - Any messages that 
- We should remove trajectories that include:
    - Attachments
    - Edited messages
    - Reactions/replies to unsupported messages
- Chat template
    - TODO: how should we structure the chat template?
    - TODO: any custom tokens we should add?
- Misc
    - TODO: what should the system prompt be? can we use prior work on imessage fine-tuning?
        - https://edwarddonner.com/2024/01/11/fine-tune-llama-for-text-messages-part-1/
        - https://edwarddonner.com/2024/01/17/fine-tune-llm-on-texts-part-2-the-data/
        - https://edwarddonner.com/2024/01/24/fine-tuning-an-llm-on-your-texts-part-3-curating-the-dataset/
        - https://edwarddonner.com/2024/01/31/fine-tuning-an-llm-on-your-text-messages-using-qlora/
        - https://edwarddonner.com/2024/02/07/fine-tune-llm-on-texts-a-simulation-of-you/
        - https://edwarddonner.com/2024/01/02/fine-tuning-an-llm-on-240k-text-messages/
    - TODO: should we include examples in the prompt? or can we rely solely on lots of training data to learn via SFT/RL?
    - TODO: should the completion include chain of thought or is it sufficient to just predict the next message? if we need chain of thought, how can we generate it for the 10s - 100s of thousands of training examples?
    - TODO: what is the most effective way to structure the messages in the prompt? what data should be included (name, timestamp) and how should we convey message types like reactions, replies, etc.?
    - Anything else?

## Full dataset extraction guide
### Filtering
- Remove group chats
- Remove conversations where `service != 'iMessage'` (excludes SMS, RCS, etc.)
- Resolve contact names for conversations by joining with `AddressBook` database, normalizing phone numbers
- Remove conversations with no contact name
- Remove conversations with fewer than 50 messages
- Remove messages with `item_type != 0`
- Remove messages with `associated_message_type` between 3000-3005 (removed reactions)
- Order messages by ROWID (database insertion order) instead of date

### Transforming
- Convert edited messages to the latest version, dropping the edit history
- For text messages, use the `text` field if available, otherwise
    - Convert rich text formatting, mentions, effects, links with rich previews, data detection to plain text
    - Convert reactions into a reaction message type with the reaction type and message it references (mark as invalid if the message it references doesn't exist): heart [2000], thumbs_up [2001], thumbs_down [2002], haha [2003], exclamation [2004], question [2005] or the emoji if custom emoji [2006] or "sticker" if sticker [2007]
    - Concatenate multi-part messages into a single message with the content of all parts
- For all message types, if it's a reply, resolve the reaction/reply GUID for the message it's replying to and mark as the parent message (marking the message as invalid if the parent message doesn't exist)
    - 'p:0/GUID' → extract 'GUID' 
    - 'bp:0/GUID' → extract 'GUID'
    - Use extracted GUID for message lookup
- Convert message effect messages into a text message type with the content as plain text
- Convert rich links into a text message type with just the original url as plain text
- For attachments, voice messages, location sharing, apple pay, digital touch, and handwriting, convert to respective message types with `None` as the content
- Convert newlines in message content into `\\n`

A message essentially has the following properties:
- Message type (text, attachment, reaction, voice message, location sharing, apple pay, digital touch, handwriting)
- A timestamp (converted from Apple epoch timestamp to a readable format e.g. `2025-05-19 06:14:22`)
- A nullable parent message guid (defined if the message is a valid reply)
- A nullable content string, only defined for:
    - Text: the message text (converting rich text formatting, mentions, effects, links with rich previews, data detection to plain text)
    - Reactions: the reaction type (heart [2000], thumbs_up [2001], thumbs_down [2002], haha [2003], exclamation [2004], question [2005]) or custom emoji [2006] or "sticker" if sticker [2007]
- A sender name ("ME" if sent by the user, otherwise the sender's contact name)
- A flag indicating if the message is valid; default true, false if
    - A reaction message with invalid parent message guid
    - A reply message with invalid parent message guid
    - A balloon part
- A flag indicating if the message is a valid completion part; default true, false if
    - The valid flag is false
    - The message type is not text or reaction

### Chunking
- Let's define a "user-chunk" as a contiguous sequence of messages from the same sender (since we're only interested in 1:1 chats, this will be a contact name or "ME") that
    - Were sent within 30 minutes of each other (chunk by this first)
    - Contain only messages that are marked as valid (if a message within the chunk is marked as invalid, mark the entire chunk as invalid)
    - If any message within the chunk is not a valid completion part, mark the entire chunk as an invalid completion part
- Let's define a "conversation-chunk" as a sliding window of user-chunks that
    - Contains at least 2 user-chunks
    - Contains no invalid user-chunks (invalid chunks reset the window)
    - Ends with a user-chunk that is marked as a valid completion part
    - Contains no more than 1000 total words in the content of all messages in the user-chunks
    - The window slides forward one user-chunk at a time, removing the oldest user-chunk if needed to stay under 1000 words
    - Each valid window position creates a separate conversation-chunk (overlapping training examples)
- A conversation-chunk with `n` user-chunks can be converted into a prompt + completion pair where:
    - The prompt part is the first `n-1` user-chunks
    - The completion part is the last user-chunk

### Annotating
- For each message in the prompt part, annotate with the following:
    - unique (per conversation), sequential message index in the conversation (starting at 0, auto-incrementing)
    - absolute timestamp (e.g. [2025-05-19 06:14:22]) to provide more context about time of day, season, etc
    - the message sender (<name> or ME)
    - the message type (text, attachment, reaction, voice message, location sharing, apple pay, digital touch, handwriting) and any associated metadata (for reaction/reply, the message being reacted/replied to) -- any type besides reaction can also be a reaction
    - the message content, depending on message type
        - text: the message text (converted to plain text)
        - attachment: nothing
        - reaction: the reaction type (heart [2000], thumbs_up [2001], thumbs_down [2002], haha [2003], exclamation [2004], question [2005]) or custom emoji [2006] or "sticker" if sticker [2007]
        - voice message: nothing
        - location sharing: nothing
        - apple pay: nothing
        - digital touch: nothing
        - handwriting: nothing
- For the completion part:
    - only annotated with message type (pre-filtered for only text and reaction)
    - followed by the message content
    - multiple messages separated by a newline

### Examples
The following are valid prompt parts:
```
0 [2025-05-19 06:14:22] Rachel: [text] Hey how are you?
1 [2025-05-19 06:14:27] Rachel: [text] Let's grab lunch sometime soon
2 [2025-05-19 06:15:10] ME: [reaction:0] heart
3 [2025-05-19 06:15:15] ME: [reply:2,text] Sounds great, when are you free?
```

```
0 [2025-05-19 06:14:22] ME: [attachment]
1 [2025-05-19 06:14:27] ME: [text] Is this the golden gate bridge?
2 [2025-05-19 06:15:10] Fred: [reaction:1] thumbs_down
3 [2025-05-19 06:15:10] Fred: [reply:1,text] No, that's the bay bridge
4 [2025-05-19 06:15:15] Fred: [reply:3,attachment]
5 [2025-05-19 06:15:15] Fred: [reply:4,text] This is what the golden gate bridge looks like
6 [2025-05-19 06:15:15] ME: [reaction:5] thumbs_up
```

```
0 [2024-11-15 17:42:33] Sarah: [voice_message]
1 [2024-11-15 17:43:01] ME: [text] Everything okay?
2 [2024-11-15 17:43:45] Sarah: [voice_message]
3 [2024-11-15 17:44:10] ME: [reply:2,voice_message]
4 [2024-11-15 17:44:22] Sarah: [reaction:3] thumbs_up
5 [2024-11-15 17:55:18] Sarah: [text] Just got here!
```

```
0 [2024-08-22 13:15:04] ME: [text] Where should we meet?
1 [2024-08-22 13:15:22] Alex: [location]
2 [2024-08-22 13:15:28] Alex: [text] This coffee shop is great
3 [2024-08-22 13:16:05] ME: [reaction:2] ☕️
4 [2024-08-22 13:16:12] ME: [text] Heading over now
5 [2024-08-22 13:42:55] Alex: [text] https://blog.com/article-123
6 [2024-08-22 13:43:01] Alex: [text] Check out this article I mentioned
7 [2024-08-22 13:45:33] ME: [reply:6,text] This is really interesting, thanks for sharing
```

And here are example completions for the prompt parts above:
```
[reply:3,text] Does tomorrow work?
```

```
[text] One time I biked across the bridge!
[text] Really fun, even if the fog covered the city
```

```
[reply:6,text] Great, I'll meet you at the door
[text] Did you bring any snacks?
```

```
[reaction:7] heart
[reply:7,text] I know right! We should grab coffee again next week to discuss it more
```
