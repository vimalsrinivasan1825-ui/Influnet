import { StreamChat } from 'stream-chat';
const c = new StreamChat('a', 'b');
c.queryUsers({}).then(res => console.log(res.users[0]));
