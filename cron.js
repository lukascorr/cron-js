import cron from "node-cron"
import { Expo } from 'expo-server-sdk';
import mysql from "mysql"
import dotenv from 'dotenv'
dotenv.config();

export const poolEsmarApp = mysql.createPool({
    host:process.env.DB_ESMAR_APP_HOST,
    user:process.env.DB_ESMAR_APP_USER,
    password:process.env.DB_ESMAR_APP_PASSWORD,
    port:process.env.DB_ESMAR_APP_PORT,
    database:process.env.DB_ESMAR_APP_NAME,
    connectionLimit: process.env.DB_ESMAR_APP_CONNECTION_LIMIT
})

const expo = new Expo()
const sqlNotifications = 'SELECT * FROM notifications WHERE sent = 0'
const sqlTokens = 'SELECT * FROM tokens_mobile'

cron.schedule('* * * * *', async () => {
    console.log('Executing schedule..')
    let somePushTokens = []
    poolEsmarApp.query(sqlTokens, (err, rows,) => {
        if (err) {
            console.log(err)
        } else if (rows.length > 0) {
            somePushTokens = rows

            let messages = []
            poolEsmarApp.query(sqlNotifications, (err, rows,) => {
                if (err) {
                    console.log(err)
                } else if (rows.length > 0) {
                    rows.forEach(async data => {
                        for (let pushToken of somePushTokens) {
                            if (!Expo.isExpoPushToken(pushToken.token)) {
                                poolEsmarApp.query('DELETE FROM tokens_mobile WHERE id = ?', [pushToken.id])
                                console.error(`Push token ${pushToken.token} is not a valid Expo push token`);
                                continue;
                            }

                            messages.push({
                                to: pushToken.token,
                                sound: 'default',
                                body: data.body,
                                data: { user_id: data.user_id, id: data.id },
                            })
                        }
                    })

                    let chunks = expo.chunkPushNotifications(messages);
                    (async () => {
                        for (let chunk of chunks) {
                            try {
                                let notification = await expo.sendPushNotificationsAsync(chunk);
                                if (notification[0].status === 'ok') {
                                    poolEsmarApp.query('UPDATE notifications SET sent = 1 WHERE id = ?', [chunk[0].data.id])
                                }
                            } catch (error) {
                                console.error(error);
                            }
                        }
                    })();
                }
            })
        }
    })
});