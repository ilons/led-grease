var LedController = (function (window, $) {
	var eventChannel = this;
	var ui;
	var api;
	var server;

	var colorInput;

	var config = {
		hw: {
			leds: 7
		},
		api: {
		},
		ui: {
			input: undefined,
			events: [
			]
		},
		server: {
			host: 'localhost',
			port: 7890,
			events: {
				name: 'status'
			}
		}
	};

	var init = function(config) {
		//console.log("[LedController] init");

		config = $.extend(this.config, config);

		config.api.hw = this.config.hw;
		config.ui.hw = this.config.hw;
		config.server.numLeds = this.config.hw.leds;

		this.config = config;

		// Set up ui
		this.ui = new ControllerUI(eventChannel, config.ui);
		this.ui.init();

		// Set up new server
		this.server = new Server(eventChannel, config.server);
		// Set up api
		this.api = new ControllerApi(eventChannel, config.api, this.server);

	};

	function Server(eventChannel, config) {
		var config = config;
		var eventName = config.events.name;
		var endpoint = 'ws://' + config.host + ':' + config.port;
		var socket;

		// Connect to a Fadecandy server
		$(eventChannel).trigger(eventName, {status: 'Connecting to fcserver...'});
		socket = new WebSocket(endpoint);

		socket.onclose = function(event) {
			$(eventChannel).trigger(eventName, {status: 'Not connected to fcserver'});
		};

		socket.onopen = function(event) {
			$(eventChannel).trigger(eventName, {status: 'Connected'});
		};

		socket.onmessage = function (event) {
			$(eventChannel).trigger(eventName, {status: '[Server]: ' + event.data});
		}

		socket.isReady = function() {
			var packetLength = 4 + config.numLeds * 3;

			if (this.readyState != 1) {
				// The server connection isn't open, can't send.
				$(eventChannel).trigger(eventName, {status: 'Disconnected!'});
				return false;
			} else if (this.bufferedAmount > packetLength) {
				// More than one packet worth of data are buffered, not ready to send.
				$(eventChannel).trigger(eventName, {status: 'Buffering!'});
				return false;
			}
			return true;
		};

		var createPacket = function() {
			// Packet header (4) + total leds (config.leds) * colors per led? (3)
			return new Uint8ClampedArray(4 + config.numLeds * 3);
		};

		var push = function(packet) {
			// Do not try to send undefined packet
			if (packet === undefined) {
				$(eventChannel).trigger(eventName, {status: 'No data to send'});
				return;
			}

			//console.log(packet);
			// Do not try to send anything if socket is not ready
			if (!socket.isReady()) {
				$(eventChannel).trigger(eventName, {status: 'socket not ready'});
				return;
			}

			//console.log(packet);
			return socket.send(packet.buffer);
		};

		return {
			createPacket: createPacket,
			push: push
		};
	};

	function ControllerApi(eventChannel, config, server) {
		var eventChannel = eventChannel;
		var config = config;
		var server = server;

		$(eventChannel).on('power:on', function (event, data) {
			//console.log("[ControllerApi] power:on, color: ", data); 
		});

		$(eventChannel).on('power:off', function (event, data) {
			//console.log("[ControllerApi] power:off"); 
			var packet = server.createPacket(); // empty package
			// Call twice to turn off instantly instead of fade out
			//server.push(packet);
			//console.log(server);
			server.push(packet);
		});

		$(eventChannel).on('color:change', function (event, data) {
			var packet = server.createPacket();
			// Don't overwrite packet header
			var dest = 4;

			// 64 leds is the most one Fadecandy can handle on each pin
			var leds = {first: 1, count: 64};
			var defaults = {
				color: {r: 0, g: 0, b: 0, a: 0}, 
				leds: {
					first: 1,
					count: config.hw.leds
				}
			};

			color = $.extend(defaults.color, data.color);
			leds = $.extend(defaults.leds, leds);

			leds.last = leds.first + leds.count -1;
			if (leds.last > config.leds) {
				leds.last = config.leds;
			}

			dest = dest + (leds.first -1) * 3;
			for (led = leds.first -1; led < leds.last; led++) {
				packet[dest++] = color.r;
				packet[dest++] = color.g;
				packet[dest++] = color.b;
			}

			server.push(packet);
		});

		return {
		};
	}

	function ControllerUI(eventChannel, config) {
		var config = config;
		var api = api;
		var ui = this;
		var colorInput;

		var init = function() {
			colorInput = initColorPicker();

			$(config.events).each(function () {
				var eConf = this;
				var el = $('#' + eConf.id);

				switch (eConf.name) {
					case 'power:on':
						$(el).on(eConf.on, function(event) {
							setPowerState('power:on', {fade: false});
							setColor(event, getColor()); 
						});
						break;
					case 'power:off':
						$(el).on(eConf.on, function() {
							setPowerState('power:off', false);
						});
						break;
					case 'status:change':
						$(eventChannel).on(eConf.name, function(event, data) {
							$(el).text(data.status);
						});
						break;
					case 'color:change':
						$(el).on(eConf.on, function(event, data) {
							setColor(event, data);
						});
						break;
				}
			});
		};

		var initColorPicker = function () {
			var colorPickerConfig = {
				inputSelector: '#colorPicker',
				color: "#f00",
				flat: true,
				showInput: false,
				showButtons: false,
				move: function(color)
				{
					$(this).attr('value', color.toHexString());
					$(this).trigger('change', {rgb: color.toRgb(), hex: color.toHex()});
				}
			
			};
			return $(colorPickerConfig.inputSelector).spectrum(colorPickerConfig);
		};

		var getColor = function() {
			var color = colorInput.spectrum("get");
			return {
				rgb: color.toRgb(),
				hex: color.toHex()
			};
		};

		var setColor = function(e, data) {
			$(eventChannel).trigger('color:change', {color: data.rgb});
		};

		var setPowerState = function(state, fade) {
			$(eventChannel).trigger(state, {fade: fade});
		};

		return {
			init: init,
			getColor: getColor,
			setColor: setColor,
			setPowerState: setPowerState
		};
	}

	return {
		config: config,
		init: init,
		api: api,
		ui: ui
	};
})(window, jQuery);
