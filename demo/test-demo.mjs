import { io } from 'socket.io-client';

const SERVER_URL = 'http://localhost:3000';

function createUser(userId, displayName) {
  return new Promise((resolve, reject) => {
    const socket = io(SERVER_URL, {
      query: { userId, displayName },
      transports: ['websocket'],
    });

    const user = {
      userId,
      displayName,
      socket,
      messages: [],
      dms: [],
      notifications: [],
    };

    socket.on('connect', () => {
      console.log(`✅ ${displayName} connected (socket: ${socket.id})`);
      resolve(user);
    });

    socket.on('connect_error', (err) => {
      console.error(`❌ ${displayName} connection error:`, err.message);
      reject(err);
    });

    socket.on('chat_message', (data) => {
      console.log(`📨 ${displayName} received chat message:`, data);
      user.messages.push(data);
    });

    socket.on('dm_message', (data) => {
      console.log(`💬 ${displayName} received DM:`, data);
      user.dms.push(data);
    });

    socket.on('notification', (data) => {
      console.log(`🔔 ${displayName} received notification:`, data);
      user.notifications.push(data);
    });

    socket.on('presence:user_online', (data) => {
      console.log(`👋 ${displayName} sees user online:`, data.userId);
    });

    socket.on('presence:chat_joined', (data) => {
      console.log(`🚪 ${displayName} sees user joined chat:`, data);
    });
  });
}

function joinChat(user, chatId) {
  return new Promise((resolve) => {
    console.log(`\n🔵 ${user.displayName} joining chat: ${chatId}`);
    user.socket.emit('chat:join', { chatId }, (response) => {
      console.log(`   Response:`, response);
      resolve(response);
    });
  });
}

function sendChatMessage(user, chatId, text) {
  return new Promise((resolve) => {
    console.log(`\n💬 ${user.displayName} sending to ${chatId}: "${text}"`);
    // Include senderName in data so receivers see the display name
    user.socket.emit('chat:sendMessage', {
      chatId,
      data: { text, senderName: user.displayName }
    }, (response) => {
      console.log(`   Response:`, response);
      resolve(response);
    });
  });
}

function sendDM(user, toUserId, text) {
  return new Promise((resolve) => {
    console.log(`\n📩 ${user.displayName} sending DM to ${toUserId}: "${text}"`);
    // Include senderName in data so receiver sees the display name
    user.socket.emit('dm:send', {
      toUserId,
      data: { text, senderName: user.displayName }
    }, (response) => {
      console.log(`   Response:`, response);
      resolve(response);
    });
  });
}

function subscribePresence(user, userIds) {
  return new Promise((resolve) => {
    console.log(`\n👀 ${user.displayName} subscribing to presence of:`, userIds);
    user.socket.emit('presence:subscribe', { userIds }, (response) => {
      console.log(`   Response:`, response);
      resolve(response);
    });
  });
}

async function checkOnlineUsers() {
  const response = await fetch(`${SERVER_URL}/presence/online/detailed`);
  const data = await response.json();
  console.log('\n📊 Online users:', JSON.stringify(data, null, 2));
  return data;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTests() {
  console.log('🚀 Starting SocketOi Demo Tests\n');
  console.log('='.repeat(50));

  try {
    // Create two users
    console.log('\n📝 Creating User 1 (Alice)...');
    const alice = await createUser('alice-123', 'Alice');

    console.log('\n📝 Creating User 2 (Bob)...');
    const bob = await createUser('bob-456', 'Bob');

    await sleep(500);

    // Check online users
    await checkOnlineUsers();

    // Subscribe to each other's presence
    console.log('\n' + '='.repeat(50));
    console.log('TEST 1: Presence Subscription');
    console.log('='.repeat(50));

    await subscribePresence(alice, ['bob-456']);
    await subscribePresence(bob, ['alice-123']);

    await sleep(500);

    // Join chat room
    console.log('\n' + '='.repeat(50));
    console.log('TEST 2: Chat Room');
    console.log('='.repeat(50));

    await joinChat(alice, 'general');
    await sleep(300);
    await joinChat(bob, 'general');
    await sleep(300);

    // Send chat messages
    await sendChatMessage(alice, 'general', 'Hello everyone! This is Alice.');
    await sleep(500);

    await sendChatMessage(bob, 'general', 'Hi Alice! Bob here.');
    await sleep(500);

    await sendChatMessage(alice, 'general', 'How are you Bob?');
    await sleep(500);

    // Verify messages received
    console.log('\n📬 Messages received by Alice:', alice.messages.length);
    console.log('📬 Messages received by Bob:', bob.messages.length);

    // Direct Messages
    console.log('\n' + '='.repeat(50));
    console.log('TEST 3: Direct Messages');
    console.log('='.repeat(50));

    await sendDM(alice, 'bob-456', 'Hey Bob, this is a private message!');
    await sleep(500);

    await sendDM(bob, 'alice-123', 'Got it Alice! Replying privately.');
    await sleep(500);

    // Verify DMs
    console.log('\n📬 DMs received by Alice:', alice.dms.length);
    console.log('📬 DMs received by Bob:', bob.dms.length);

    // Test notifications via REST API
    console.log('\n' + '='.repeat(50));
    console.log('TEST 4: Notifications (REST API)');
    console.log('='.repeat(50));

    // Send notification to Alice
    console.log('\n🔔 Sending notification to Alice...');
    const notifResponse = await fetch(`${SERVER_URL}/notifications/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: 'alice-123',
        event: 'notification',
        data: {
          title: 'Test Notification',
          message: 'This is a test notification from the API!',
        },
      }),
    });
    console.log('   API Response:', await notifResponse.json());
    await sleep(500);

    // Broadcast notification
    console.log('\n📢 Broadcasting notification to all users...');
    const broadcastResponse = await fetch(`${SERVER_URL}/notifications/broadcast`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'system_announcement',
        data: {
          title: 'System Update',
          message: 'This is a broadcast message to everyone!',
        },
      }),
    });
    console.log('   API Response:', await broadcastResponse.json());
    await sleep(500);

    // Verify notifications
    console.log('\n🔔 Notifications received by Alice:', alice.notifications.length);
    console.log('🔔 Notifications received by Bob:', bob.notifications.length);

    // Final check
    console.log('\n' + '='.repeat(50));
    console.log('FINAL RESULTS');
    console.log('='.repeat(50));

    await checkOnlineUsers();

    console.log('\n✅ Alice stats:');
    console.log(`   - Chat messages received: ${alice.messages.length}`);
    console.log(`   - DMs received: ${alice.dms.length}`);
    console.log(`   - Notifications received: ${alice.notifications.length}`);

    console.log('\n✅ Bob stats:');
    console.log(`   - Chat messages received: ${bob.messages.length}`);
    console.log(`   - DMs received: ${bob.dms.length}`);
    console.log(`   - Notifications received: ${bob.notifications.length}`);

    // Disconnect
    console.log('\n👋 Disconnecting users...');
    alice.socket.disconnect();
    bob.socket.disconnect();

    await sleep(500);
    await checkOnlineUsers();

    console.log('\n🎉 All tests completed!\n');

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

runTests();
