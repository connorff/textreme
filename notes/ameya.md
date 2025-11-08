text messages

```python
osascript <<'APPLESCRIPT'
tell application "Contacts" to set p to first person whose name is "Connor Fogarty"

set h to ""
tell application "Contacts"
	if (count of phones of p) > 0 then
		set h to value of first phone of p
	else if (count of emails of p) > 0 then
		set h to value of first email of p
	end if
end tell

if h is "" then error "Connor Fogarty has no phone or email in Contacts."

open location ("imessage://" & h)
tell application "Messages" to activate
APPLESCRIPT
```

```python
osascript <<'APPLESCRIPT'
-- Get Connor's first phone or email from Contacts
tell application "Contacts" to set p to first person whose name is "Connor Fogarty"
set h to ""
tell application "Contacts"
	if (count of phones of p) > 0 then
		set h to value of first phone of p
	else if (count of emails of p) > 0 then
		set h to value of first email of p
	end if
end tell
if h is "" then error "Connor Fogarty has no phone or email in Contacts."

-- Open the Messages thread via URL scheme
do shell script "open " & quoted form of ("imessage://" & h)

-- Type "Hi Connor" without sending
delay 0.8
tell application "System Events"
	tell process "Messages"
		keystroke "Hi Connor"
	end tell
end tell
APPLESCRIPT
```


https://github.com/danikhan632/iMessage-API/blob/main/server.py