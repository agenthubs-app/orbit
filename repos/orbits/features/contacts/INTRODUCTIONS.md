# Contact introductions

The introductions page reads and writes the `contact_introductions` live-record
collection. Every record carries the authenticated actor id both as `userId`
and in its payload. Reads filter by that actor before mapping any record.

Creating an introduction:

1. requires two different contact ids;
2. verifies both contacts belong to the authenticated account;
3. requires a user-written introduction note;
4. saves a `draft` record only;
5. never sends email, chat, notifications, or calendar events.

The page does not derive introduction history from the contacts list. A person
appearing in contacts is not evidence that an introduction happened.
