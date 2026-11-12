# WhatsApp Support Workflow

The support workflow runs inside OpenWA and uses the connected WhatsApp session. It does not call OpenAI or another model provider, and it does not require a second API key. Answers are sent exactly as written in the approved knowledge base.

## Configure it

1. Open **WhatsApp Support** and select a ready WhatsApp session.
2. Under **Answers**, add a category, client question, and verified answer. Approve each answer before it can be shown to clients.
3. Under **Groups**, enable the groups that should use the support workflow. A group needs at least one active approved answer.
4. Ask a client to send a message in an enabled group. OpenWA replies with the category menu. The client replies with a number, chooses a question, and receives its predefined answer.
5. Each answer offers `0` or `human` for escalation. The group and requester appear under **Human support**. An agent opens that WhatsApp group from the dashboard's Chats page, replies there, then marks the request closed after resolving it.

Requests are tracked separately for each sender in a group. While a request is in human support, automated replies for that sender pause. Closing a request keeps its case record and the WhatsApp group history. The sender's next message starts a new support menu.

## Scope

- Category and question menus use plain numbered WhatsApp messages, so they work in group chats without interactive button support.
- Agents can claim an unassigned request using their dashboard API key name. The active queue is available to dashboard administrators; automatic staff notifications are not included.
- Support answers are deterministic and come only from approved content. This is FAQ automation, not generative AI.
- `human` escalation keeps the client in the same WhatsApp group. Support agents must have access to that group in the selected session.
