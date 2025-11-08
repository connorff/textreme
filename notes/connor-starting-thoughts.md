**Current thoughts**

- SFT / RL a medium-size base model to generate responses to texts given some message history
- p0 is generating messages sent from yourself
- p1 is also generating responses from whoever you're texting
- The product is a simple overlay that allows the user to send a message to an existing conversation, using either tab or agent modes
- UX: default to showing the conversation with most recent activity, plus dropdown/selector to open others
- Tab mode: use the fine-tune to suggest a response (or multiple candidates) which auto-updates while typing (with as close to instant latency as possible)
- Agent mode: user describes the type of message they want to send, intended response, etc and a smarter model uses tools (grep / semantic search messages, web, calendar,email, etc) and the fine-tune to generate candidate messages with additional context + the response to those candidate messages to find the optimal response
⁃ For both tab / agent modes, the user sends their message from within the overlay which shows a success state then auto-closes (since latency + context switching openingthe messages app is bad)
⁃ Unknowns: What's a sexy demo we could show? What subset of messages features should we support?