const fs = require('fs');
const express = require('express');
const bodyParser = require('body-parser');
const login = require('ws3-fca');

const app = express();
app.use(bodyParser.urlencoded({ extended: true }));

let botConfig = {}; // Admin ID aur prefix store karne ke liye

// HTML Form serve karna
app.get('/', (req, res) => {
    res.send(`
        <html>
        <head>
            <title>Messenger Bot Configuration</title>
            <style>
                body {
                    background-color: #FF1493; /* Deep Pink */
                    color: #87CEEB; /* Sky Blue */
                    font-family: Arial, sans-serif;
                    text-align: center;
                    padding: 20px;
                }
                input, textarea, button {
                    margin: 10px auto;
                    padding: 10px;
                    width: 80%;
                    max-width: 400px;
                    background-color: #FFFF00; /* Yellow */
                    color: black;
                    font-size: 16px;
                    border: none;
                    border-radius: 5px;
                }
                button {
                    background-color: #4CAF50; /* Green */
                    color: white;
                    cursor: pointer;
                }
                button:hover {
                    background-color: #45a049;
                }
            </style>
        </head>
        <body>
            <h1>Messenger Bot Configuration</h1>
            <form method="POST" action="/configure">
                <label>Admin ID:</label>
                <input type="text" name="adminID" placeholder="Enter your Facebook ID" required>
                <label>Prefix:</label>
                <input type="text" name="prefix" value="*" required>
                <label>Appstate JSON:</label>
                <textarea name="appstate" rows="10" placeholder="Paste appstate JSON here..." required></textarea>
                <button type="submit">Start Bot</button>
            </form>
        </body>
        </html>
    `);
});

// Configuration handle karna
app.post('/configure', (req, res) => {
    const { adminID, prefix, appstate } = req.body;

    // Configuration save karna
    botConfig = { adminID, prefix };
    try {
        fs.writeFileSync('appstate.json', appstate);
        res.send('<h1>Bot is starting...</h1><p>Go back to the console to see logs.</p>');
        startBot(); // Bot start karna
    } catch (err) {
        res.send('<h1>Error saving appstate.json. Please check the file format.</h1>');
    }
});

// Bot start karna
function startBot() {
    let appState;
    try {
        appState = JSON.parse(fs.readFileSync('appstate.json', 'utf8'));
    } catch (err) {
        console.error('❌ Invalid appstate.json file. Please check the format.');
        return;
    }

    login({ appState }, (err, api) => {
        if (err) {
            console.error('❌ Login failed:', err.error || err);
            setTimeout(startBot, 5000); // Retry after 5 seconds
            return;
        }

        console.log('✅ Bot successfully logged in!');
        api.setOptions({ listenEvents: true });

        const lockedGroups = {};
        const lockedNicknames = {};

        // Events listen karna
        api.listenMqtt((err, event) => {
            if (err) {
                console.error('❌ Event listener error:', err);
                return;
            }

            if (event.type === 'message' && event.body.startsWith(botConfig.prefix)) {
                const senderID = event.senderID;
                const args = event.body.slice(botConfig.prefix.length).trim().split(' ');
                const command = args[0].toLowerCase();

                if (senderID !== botConfig.adminID) {
                    return api.sendMessage('❌ You are not authorized.', event.threadID);
                }

                // Commands handle karna
                if (command === 'grouplockname' && args[1] === 'on') {
                    const groupName = args.slice(2).join(' ');
                    lockedGroups[event.threadID] = groupName;
                    api.setTitle(groupName, event.threadID, (err) => {
                        if (err) return api.sendMessage('❌ Failed to lock group name.', event.threadID);
                        api.sendMessage(`✅ Group name locked as: ${groupName}`, event.threadID);
                    });
                } else if (command === 'nicknamelock' && args[1] === 'on') {
                    const nickname = args.slice(2).join(' ');
                    lockedNicknames[event.threadID] = nickname;
                    api.getThreadInfo(event.threadID, (err, info) => {
                        if (err) return console.error(err);
                        info.participantIDs.forEach((userID) => {
                            api.changeNickname(nickname, event.threadID, userID);
                        });
                        api.sendMessage(`✅ Nicknames locked as: ${nickname}`, event.threadID);
                    });
                }
            }

            // Auto-Revert Group Name Changes
            if (event.logMessageType === 'log:thread-name') {
                const lockedName = lockedGroups[event.threadID];
                if (lockedName) {
                    api.setTitle(lockedName, event.threadID);
                }
            }

            // Auto-Revert Nickname Changes
            if (event.logMessageType === 'log:thread-nickname') {
                const lockedNickname = lockedNicknames[event.threadID];
                if (lockedNickname) {
                    const userID = event.logMessageData.participant_id;
                    api.changeNickname(lockedNickname, event.threadID, userID);
                }
            }
        });
    });
}

// Server start karna
app.listen(3000, () => {
    console.log('🌐 Server is running on http://localhost:3000');
});
