'use strict';

const {session} = require('electron');

const FILTER = {urls: ['<all_urls>']};
const TYPING_REQUEST = /https:\/\/web(?:\.canary)?\.fluxer\.app\/api\/v1\/channels\/[^/?#]+\/typing(?:[?#]|$)/;

function isTypingRequest(url) {
	try { return TYPING_REQUEST.test(decodeURIComponent(url)); }
	catch { return TYPING_REQUEST.test(url); }
}

let _enabled = false;

module.exports = {
	name: 'invisibleTyping',
	displayName: 'Invisible Typing',
	description: 'Prevents Fluxer from sending typing indicators to other users.',
	icon: '👻',
	rendererSrc: null,

	start() {
		_enabled = true;
		session.defaultSession.webRequest.onBeforeRequest(FILTER, (details, callback) => {
			callback({cancel: _enabled && isTypingRequest(details.url)});
		});
	},

	stop() {
		_enabled = false;
		session.defaultSession.webRequest.onBeforeRequest(FILTER, null);
	},
};
