// Connect to the signaling server
import { io } from "socket.io-client";

const socket = io("https://vpn-server-production.up.railway.app",{
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000
});

// DOM elements
const usernameInput = document.getElementById('username');
const roomNameInput = document.getElementById('room-name');
const createButton = document.getElementById('create-btn');
const joinButton = document.getElementById('join-btn');
const disconnectButton = document.getElementById('disconnect-btn');
const connectionForm = document.querySelector('.connection-form');
const roomInfo = document.getElementById('room-info');
const currentRoomSpan = document.getElementById('current-room');
const usersList = document.getElementById('users-list');
const virtualIpSpan = document.getElementById('virtual-ip');
const connectionTypeSpan = document.getElementById('connection-type');
const latencySpan = document.getElementById('latency');
const packetLossSpan = document.getElementById('packet-loss');

// Store peer connections
const peers = {};
let currentRoom = null;
let localUsername = null;
// Track pending ICE candidates
const pendingCandidates = {};
// Track if we're in serverless mode
let serverlessMode = false;

// Generate a random virtual IP in the 10.0.0.x range
function generateVirtualIP() {
    return `10.0.0.${Math.floor(Math.random() * 253) + 1}`;
}

// Initialize WebRTC peer connection with another user
function initPeerConnection(targetId, isInitiator) {
    console.log(`Initializing WebRTC connection with ${targetId}, initiator: ${isInitiator}`);
    
    // Configuration with STUN/TURN servers
    const rtcConfig = {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
            { 
                urls: "turn:openrelay.metered.ca:80",
                username: "openrelayproject",
                credential: "openrelayproject" 
            },
            {
                urls: "turn:openrelay.metered.ca:443",
                username: "openrelayproject",
                credential: "openrelayproject"
            },
            {
                urls: "turn:openrelay.metered.ca:443?transport=tcp",
                username: "openrelayproject",
                credential: "openrelayproject"
            }
        ],
        iceCandidatePoolSize: 10,
        iceTransportPolicy: 'all'
    };

    // Create a new RTCPeerConnection
    const peerConnection = new RTCPeerConnection(rtcConfig);
    
    // Create a data channel or wait for one to be created
    let dataChannel = null;
    
    if (isInitiator) {
        dataChannel = peerConnection.createDataChannel("gameData", {
            ordered: false, // Allow out-of-order delivery for games
            maxRetransmits: 3 // Limit retransmissions for real-time data
        });
        setupDataChannel(dataChannel, targetId);
    } else {
        peerConnection.ondatachannel = (event) => {
            dataChannel = event.channel;
            setupDataChannel(dataChannel, targetId);
        };
    }
    
    // Handle ICE candidates
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            console.log(`Sending ICE candidate to ${targetId}`);
            socket.emit('signal', {
                to: targetId,
                signal: {
                    type: 'candidate',
                    ice: event.candidate
                }
            });
        }
    };
    
    // Track connection state changes
    peerConnection.oniceconnectionstatechange = () => {
        console.log(`ICE connection state with ${targetId}: ${peerConnection.iceConnectionState}`);
        
        if (peerConnection.iceConnectionState === 'connected' || 
            peerConnection.iceConnectionState === 'completed') {
            connectionTypeSpan.textContent = 'Peer-to-peer';
            
            // Process any pending ICE candidates
            if (pendingCandidates[targetId] && pendingCandidates[targetId].length > 0) {
                console.log(`Processing ${pendingCandidates[targetId].length} pending ICE candidates for ${targetId}`);
                pendingCandidates[targetId].forEach(candidate => {
                    try {
                        peerConnection.addIceCandidate(candidate);
                    } catch (err) {
                        console.error('Error processing pending ICE candidate:', err);
                    }
                });
                delete pendingCandidates[targetId];
            }
        } else if (peerConnection.iceConnectionState === 'failed' || 
                   peerConnection.iceConnectionState === 'disconnected') {
            connectionTypeSpan.textContent = 'Reconnecting...';
            
            // Try to restart ICE
            try {
                peerConnection.restartIce();
                
                // If we're the initiator, create a new offer with ICE restart
                if (peers[targetId] && peers[targetId].isInitiator) {
                    setTimeout(() => {
                        peerConnection.createOffer({ iceRestart: true })
                            .then(offer => peerConnection.setLocalDescription(offer))
                            .then(() => {
                                socket.emit('signal', {
                                    to: targetId,
                                    signal: {
                                        type: 'offer',
                                        sdp: peerConnection.localDescription
                                    }
                                });
                            })
                            .catch(err => console.error('Error creating restart offer:', err));
                    }, 1000);
                }
            } catch (err) {
                console.error('Error restarting ICE:', err);
                connectionTypeSpan.textContent = 'Relay (fallback)';
            }
        } else if (peerConnection.iceConnectionState === 'disconnected') {
            connectionTypeSpan.textContent = 'Reconnecting...';
            
            // Set a timeout to try reconnecting if still disconnected
            setTimeout(() => {
                if (peerConnection.iceConnectionState === 'disconnected' && 
                    peers[targetId] && peers[targetId].isInitiator) {
                    console.log(`Still disconnected from ${targetId}, attempting to restart connection`);
                    
                    try {
                        peerConnection.restartIce();
                        peerConnection.createOffer({ iceRestart: true })
                            .then(offer => peerConnection.setLocalDescription(offer))
                            .then(() => {
                                socket.emit('signal', {
                                    to: targetId,
                                    signal: {
                                        type: 'offer',
                                        sdp: peerConnection.localDescription
                                    }
                                });
                            })
                            .catch(err => console.error('Error creating reconnection offer:', err));
                    } catch (err) {
                        console.error('Error during reconnection attempt:', err);
                        connectionTypeSpan.textContent = 'Relay (fallback)';
                    }
                }
            }, 3000); // Wait 3 seconds before trying to reconnect
        } else if (peerConnection.iceConnectionState === 'closed') {
            console.log(`Connection to peer ${targetId} closed`);
            cleanupPeerConnection(targetId);
        }
    };
    
    // If we're the initiator, create and send an offer
    if (isInitiator) {
        createAndSendOffer(peerConnection, targetId);
    }
    
    // Return an object with the connection and associated data
    return {
        connection: peerConnection,
        dataChannel: dataChannel,
        metadata: null,
        isInitiator: isInitiator,
        startTime: Date.now()
    };
}

// Setup data channel event handlers
function setupDataChannel(dataChannel, targetId) {
    // Store the data channel reference in the peer object
    if (peers[targetId]) {
        peers[targetId].dataChannel = dataChannel;
    }
    
    dataChannel.onopen = () => {
        console.log(`Data channel with ${targetId} opened`);
        
        // Send our username to the peer once connected
        sendDataToPeer(targetId, {
            type: 'metadata',
            username: localUsername,
            id: socket.id
        });
        
        // Start latency measurements
        startLatencyMeasurements(targetId);
    };
    
    dataChannel.onclose = () => {
        console.log(`Data channel with ${targetId} closed`);
    };
    
    dataChannel.onerror = (error) => {
        console.error(`Data channel error with ${targetId}:`, error);
    };
    
    dataChannel.onmessage = (event) => {
        try {
            const message = JSON.parse(event.data);
            
            if (message.type === 'ping') {
                // Respond to ping
                sendDataToPeer(targetId, {
                    type: 'pong',
                    timestamp: message.timestamp
                });
            } else if (message.type === 'pong') {
                // Calculate latency
                const latency = Date.now() - message.timestamp;
                latencySpan.textContent = `${latency}ms`;
            } else if (message.type === 'gamePacket') {
                // Handle game data packets
                console.log('Received game packet:', message.data);
                // This is where we'd process game-specific packets
            } else if (message.type === 'metadata') {
                // Store peer metadata
                if (peers[targetId]) {
                    peers[targetId].metadata = {
                        username: message.username,
                        id: message.id
                    };
                    
                    // If in serverless mode, update the UI
                    if (serverlessMode) {
                        updateUsersListServerless();
                    }
                }
            } else if (message.type === 'serverless-user-joined') {
                // Handle new user in serverless mode
                console.log('Serverless: User joined notification from peer');
                
                // Connect to the new user if we don't have a connection yet
                if (!peers[message.user.id] && message.user.id !== socket.id) {
                    // Use deterministic initiator selection
                    const shouldInitiate = socket.id.localeCompare(message.user.id) > 0;
                    peers[message.user.id] = initPeerConnection(message.user.id, shouldInitiate);
                    
                    // Store metadata
                    peers[message.user.id].metadata = {
                        username: message.user.username,
                        id: message.user.id
                    };
                }
                
                // Update UI
                if (serverlessMode) {
                    updateUsersListServerless();
                }
            } else if (message.type === 'serverless-user-left') {
                // Handle user leaving in serverless mode
                console.log('Serverless: User left notification from peer:', message.userId);
                
                // Close connection if exists
                if (peers[message.userId]) {
                    cleanupPeerConnection(message.userId);
                }
                
                // Always update UI regardless of serverless mode
                // This ensures the UI refreshes when peers leave
                if (serverlessMode) {
                    updateUsersListServerless();
                } else if (currentRoom) {
                    // Force UI refresh even in normal mode
                    const remainingPeers = Object.keys(peers).map(id => ({
                        id: id,
                        username: peers[id].metadata ? peers[id].metadata.username : 'Unknown'
                    }));
                    
                    // Add self to the list
                    remainingPeers.push({
                        id: socket.id,
                        username: localUsername
                    });
                    
                    // Update UI with remaining peers
                    updateUsersList(remainingPeers.reduce((acc, user) => {
                        acc[user.id] = user;
                        return acc;
                    }, {}));
                }
            }
        } catch (err) {
            console.error('Error parsing peer data:', err);
        }
    };
}

// Create and send an offer
async function createAndSendOffer(peerConnection, targetId) {
    try {
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        
        console.log(`Sending offer to ${targetId}`);
        socket.emit('signal', {
            to: targetId,
            signal: {
                type: 'offer',
                sdp: peerConnection.localDescription
            }
        });
    } catch (error) {
        console.error('Error creating offer:', error);
    }
}

// Handle incoming WebRTC signals
async function processSignal(from, signal) {
    try {
        // If we don't have a peer connection yet, create one
        if (!peers[from]) {
            peers[from] = initPeerConnection(from, false);
        }
        
        const peerConnection = peers[from].connection;
        
        // Handle different signal types
        if (signal.type === 'offer') {
            console.log(`Processing offer from ${from}`);
            await peerConnection.setRemoteDescription(new RTCSessionDescription(signal.sdp));
            
            // Create and send answer
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            
            console.log(`Sending answer to ${from}`);
            socket.emit('signal', {
                to: from,
                signal: {
                    type: 'answer',
                    sdp: peerConnection.localDescription
                }
            });
        } else if (signal.type === 'answer') {
            console.log(`Processing answer from ${from}`);
            await peerConnection.setRemoteDescription(new RTCSessionDescription(signal.sdp));
        } else if (signal.type === 'candidate') {
            // Handle ICE candidate
            console.log(`Processing ICE candidate from ${from}`);
            
            try {
                // Only add candidate if we have set remote description
                if (peerConnection.remoteDescription) {
                    await peerConnection.addIceCandidate(new RTCIceCandidate(signal.ice));
                } else {
                    // Store candidate for later
                    if (!pendingCandidates[from]) {
                        pendingCandidates[from] = [];
                    }
                    pendingCandidates[from].push(new RTCIceCandidate(signal.ice));
                }
            } catch (err) {
                console.error('Error adding ICE candidate:', err);
            }
        }
    } catch (error) {
        console.error('Error processing signal:', error);
    }
}

// Send data to a peer
function sendDataToPeer(targetId, data) {
    if (peers[targetId] && peers[targetId].dataChannel && 
        peers[targetId].dataChannel.readyState === 'open') {
        peers[targetId].dataChannel.send(JSON.stringify(data));
    } else {
        console.warn(`Cannot send data to ${targetId}: data channel not ready`);
    }
}

// Clean up peer connection
function cleanupPeerConnection(peerId) {
    if (peers[peerId]) {
        // Close data channel if it exists
        if (peers[peerId].dataChannel) {
            try {
                peers[peerId].dataChannel.close();
            } catch (e) {
                console.error(`Error closing data channel for peer ${peerId}:`, e);
            }
        }
        
        // Close peer connection
        try {
            peers[peerId].connection.close();
        } catch (e) {
            console.error(`Error closing connection for peer ${peerId}:`, e);
        }
        
        // Remove peer from list
        delete peers[peerId];
        
        // Clean up any pending candidates
        delete pendingCandidates[peerId];
    }
}

// Measure latency periodically
function startLatencyMeasurements(targetId) {
    // Send a ping every 2 seconds
    const intervalId = setInterval(() => {
        if (peers[targetId] && peers[targetId].dataChannel && 
            peers[targetId].dataChannel.readyState === 'open') {
            sendDataToPeer(targetId, {
                type: 'ping',
                timestamp: Date.now()
            });
        } else if (!peers[targetId]) {
            // Stop interval if peer no longer exists
            clearInterval(intervalId);
        }
    }, 2000);
}

// Update the users list in the UI
function updateUsersList(users) {
    usersList.innerHTML = '';
    
    Object.values(users).forEach(user => {
        const li = document.createElement('li');
        li.textContent = `${user.username} ${user.id === socket.id ? '(You)' : ''}`;
        usersList.appendChild(li);
        
        // Connect to new peers if needed
        if (user.id !== socket.id && !peers[user.id]) {
            // Use a deterministic way to decide who initiates to prevent both sides initiating
            const shouldInitiate = socket.id.localeCompare(user.id) > 0;
            console.log(`Creating peer connection with ${user.id}, initiator: ${shouldInitiate}`);
            peers[user.id] = initPeerConnection(user.id, shouldInitiate);
        }
    });
}

// Implement serverless mode when server disconnects
function enterServerlessMode() {
    console.log('Entering serverless mode');
    serverlessMode = true;
    alert('Lost connection to server. Entering peer-to-peer only mode.');
    
    // Implementation for serverless coordination would be added here
    updateUsersListServerless();
}

// Update users list in serverless mode
function updateUsersListServerless() {
    usersList.innerHTML = '';
    
    // Add self to list
    const selfLi = document.createElement('li');
    selfLi.textContent = `${localUsername}`;
    usersList.appendChild(selfLi);
    
    // Add connected peers
    Object.keys(peers).forEach(peerId => {
        if (peers[peerId].metadata) {
            const li = document.createElement('li');
            li.textContent = `${peers[peerId].metadata.username}`;
            usersList.appendChild(li);
        }
    });
}

// Show room info and hide connection form
function showRoomInfo(roomName) {
    connectionForm.style.display = 'none';
    roomInfo.style.display = 'block';
    currentRoomSpan.textContent = roomName;
    currentRoom = roomName;
    
    // Assign virtual IP
    const virtualIP = generateVirtualIP();
    virtualIpSpan.textContent = virtualIP;
}

// Handle create room button click
createButton.addEventListener('click', () => {
    const username = usernameInput.value.trim();
    const roomName = roomNameInput.value.trim();
    
    if (username && roomName) {
        localUsername = username;
        socket.emit('create-room', roomName, username);
    }
});

// Handle join room button click
joinButton.addEventListener('click', () => {
    const username = usernameInput.value.trim();
    const roomName = roomNameInput.value.trim();
    
    if (username && roomName) {
        localUsername = username;
        socket.emit('join-room', roomName, username);
    }
});

// Handle disconnect button click with improved cleanup
disconnectButton.addEventListener('click', () => {
    console.log('Disconnect button clicked, current room:', currentRoom);
    console.log('Current peers:', Object.keys(peers));
    
    // Notify all peers directly that you're leaving
    Object.keys(peers).forEach(peerId => {
        sendDataToPeer(peerId, {
            type: 'serverless-user-left',
            userId: socket.id
        });
    });
    
    // Small delay to allow messages to be sent before closing connections
    setTimeout(() => {
        // Close all peer connections
        Object.keys(peers).forEach(cleanupPeerConnection);
        
        // Show connection form again
        connectionForm.style.display = 'block';
        roomInfo.style.display = 'none';
        
        // Leave the room
        if (currentRoom) {
            console.log('Emitting leave-room event for room:', currentRoom);
            socket.emit('leave-room', currentRoom);
            currentRoom = null;
        }
        
        // Reset network stats
        connectionTypeSpan.textContent = '-';
        latencySpan.textContent = '-';
        packetLossSpan.textContent = '-';
        
        // Reset serverless mode
        serverlessMode = false;
    }, 500);
});

// Remove this duplicate event listener - properly comment out the entire block
/*
disconnectButton.addEventListener('click', () => {
    // Close all peer connections
    Object.keys(peers).forEach(cleanupPeerConnection);
    
    // Show connection form again
    connectionForm.style.display = 'block';
    roomInfo.style.display = 'none';
    
    // Leave the room
    if (currentRoom) {
        socket.emit('leave-room', currentRoom);
        
        // Add a timeout to force disconnect if no confirmation
        setTimeout(() => {
            if (currentRoom) {
                console.log('Force disconnecting due to timeout');
                currentRoom = null;
                // Additional cleanup if needed
            }
        }, 3000); // 3 second timeout
    }
    
    // Reset network stats
    connectionTypeSpan.textContent = '-';
    latencySpan.textContent = '-';
    packetLossSpan.textContent = '-';
    
    // Reset serverless mode
    serverlessMode = false;
});
*/

socket.on('room-created', roomName => {
    console.log(`Room created: ${roomName}`);
    showRoomInfo(roomName);
});

socket.on('room-joined', roomName => {
    console.log(`Room joined: ${roomName}`);
    showRoomInfo(roomName);
});

socket.on('user-joined', data => {
    console.log('User joined, updating users list:', data.users);
    updateUsersList(data.users);
});

socket.on('user-left', data => {
    console.log('User left:', data.userId);
    
    // Close peer connection if exists
    cleanupPeerConnection(data.userId);
    
    // Update users list
    if (data.users) {
        updateUsersList(data.users);
    }
});

socket.on('room-left', () => {
    console.log('Successfully left the room');
    // Additional confirmation logic if needed
});

// Then in your disconnect button handler, you could add a timeout
disconnectButton.addEventListener('click', () => {
    // Close all peer connections
    Object.keys(peers).forEach(cleanupPeerConnection);
    
    // Show connection form again
    connectionForm.style.display = 'block';
    roomInfo.style.display = 'none';
    
    // Leave the room
    if (currentRoom) {
        socket.emit('leave-room', currentRoom);
        
        // Add a timeout to force disconnect if no confirmation
        setTimeout(() => {
            if (currentRoom) {
                console.log('Force disconnecting due to timeout');
                currentRoom = null;
                // Additional cleanup if needed
            }
        }, 3000); // 3 second timeout
    }
    
    // Reset network stats
    connectionTypeSpan.textContent = '-';
    latencySpan.textContent = '-';
    packetLossSpan.textContent = '-';
    
    // Reset serverless mode
    serverlessMode = false;
});

socket.on('signal', data => {
    const { from, signal } = data;
    console.log(`Received signal from ${from}`, signal.type);
    processSignal(from, signal);
});

socket.on('error', message => {
    alert(`Error: ${message}`);
});

// Game launching functionality
document.querySelectorAll('.game-item').forEach(item => {
    item.addEventListener('click', () => {
        const game = item.getAttribute('data-game');
        alert(`Launching ${game}... (This would open the actual game in a real implementation)`);
        
        // In a real implementation, we would:
        // 1. Launch the game with appropriate network settings
        // 2. Hook into the game's network traffic
        // 3. Route that traffic through our virtual network
    });
});

// Update packet loss randomly for demo purposes
setInterval(() => {
    if (currentRoom) {
        const randomLoss = (Math.random() * 2).toFixed(1);
        packetLossSpan.textContent = `${randomLoss}%`;
    }
}, 5000);

// Add connection status logging
socket.on('connect', () => {
    console.log('Connected to server with ID:', socket.id);
});

socket.on('connect_error', (error) => {
    console.error('Connection error:', error);
});

// Handle server disconnect
socket.on('disconnect', () => {
    console.log('Disconnected from server');
    
    // Only enter serverless mode if we were in a room
    if (currentRoom) {
        enterServerlessMode();
    }
});