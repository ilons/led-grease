var LedController = (function (window, $) {
	var eventChannel = this;
	var ui;
	var api;
	var server;

	var colorInput;
	var lastColor;

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
		console.log("[LedController] init");

		config = $.extend(this.config, config);

		if (config.ui.input !== undefined) {
			eventChannel.colorInput = config.ui.input;
		}

		config.api.hw = this.config.hw;
		config.ui.hw = this.config.hw;
		config.server.numLeds = this.config.hw.leds;

		this.config = config;

		// Set up ui
		this.ui = new ControllerUI(eventChannel, config.ui);
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

			console.log(packet);
			return socket.send(packet.buffer);
		};

		return {
			createPacket: createPacket,
			push: push
		};
	};

	function ControllerApi(eventChannel, config, server) {
		var config = config;
		var server = server;

		$(eventChannel).on('power:on', function (event, data) {
			console.log(eventChannel);
			console.log("[ControllerApi] power:on, color: ", lastColor); 
			setColor(lastColor);
		});

		$(eventChannel).on('power:off', function (event, data) {
			console.log("[ControllerApi] power:off"); 
			var packet = server.createPacket(); // empty package
			// Call twice to turn off instantly instead of fade out
			//this.server.push(packet);
			//console.log(server);
			server.push(packet);
		});

		$(eventChannel).on('color:change', function (event, data) {
			color = data.color;
			leds = {first: 1, count: 7};
			console.log("[ControllerApi] setColor, color:", color);
			var packet = server.createPacket();
			// Don't overwrite packet header
			var dest = 4;
			var defaults = {
				color: {r: 0, g: 0, b: 0, a: 0}, 
				leds: {
					first: 1,
					count: config.hw.leds
				}
			};

			color = $.extend(defaults.color, color);
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

			//console.log(leds);
			server.push(packet);
			lastColor = color;
		});
	}

	function ControllerUI(eventChannel, config) {
		var config = config;
		var api = api;
		var ui = this;
		var colorPicker;

		var init = function() {
			ui.colorInput = initColorPicker();
			console.log("[ControlerUI] init");


			$(config.events).each(function () {
				var eConf = this;
				var el = $('#' + eConf.id);

				switch (eConf.name) {
					case 'power:on':
						$(el).on(eConf.on, function() {
							setPowerState('power:on', {fade: false});
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
							console.log(event, data);
							setColor(event, data);
						});
						break;
				}


			});

		};

		var initColorPicker = function () {
			console.log("[ControlerUI] initColorPicker");
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
			var colorInput = $(colorPickerConfig.inputSelector).spectrum(colorPickerConfig);
			return colorInput;
		};

		var getColor = function() {
			console.log(ui.colorPicker);
		};

		var setColor = function(e, data) {
			console.log("[ControllerUI] Set color state");
			$(eventChannel).trigger('color:change', {color: data.rgb});
		};

		var setPowerState = function(state, fade) {
			console.log("[ControllerUI] Set power state " + state);
			$(eventChannel).trigger(state, {fade: fade});
		};

		init();

		return {
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

/*
   $(function() {
   var leds = 7;

   var led = 0;
   var r = 0;
   var g = 0;
   var b = 0;

   var i;

   var tc;
   var nc = tinycolor({r: 255, g: 0, b: 0});
   var hours;
   var month;
   var ddate;

   var start = 0;

   var circles = []

   var stage = new Kinetic.Stage({
   container: 'light_canvas',
   width: leds*22,
   height: 100
   });

   var layer = new Kinetic.Layer();
   var border = new Kinetic.Circle({
   x: 0,
   y: stage.height()/2,
   radious: 1 * leds,
   fill: "#CCCCCC",
   stroke: 'black',
   strokeWidth: 3,
   });
   border.setAttr('position', 1);
   layer.add(border);


   for(led=0; led < leds; led++)
   {
   var c1 = new Kinetic.Circle({
   x: 10+(led*20),
   y: stage.height()/2,
   radius: 8,
   fill: "#000000",
   stroke: 'black',
   strokeWidth: 1,
   });

   c1.setAttr('position', led);

   circles[led] = c1;
   layer.add(circles[led]);
   }

   layer.on('mouseover', function() {
   start = Math.floor(( stage.getPointerPosition().x-10) / 20);
   drawCircles();
   });
   layer.on('touchstart', function() {
   start = Math.floor(( stage.getPointerPosition().x-10) / 20);
   drawCircles();
   });
   layer.on('touchmove', function() {
   start = Math.floor(( stage.getPointerPosition().x-10) / 20);
   drawCircles();
   });

   stage.add(layer);

$("#colorPicker").on('changed', function(event, data) {
	updateColor(data.rgb);
});

function updateColor(rgb) {
	nc = tinycolor({r: rgb.r, g: rgb.g, b: rgb.b});

	r = nc.toRgb().r;
	g = nc.toRgb().g;
	b = nc.toRgb().b;
	drawCircles();
}

function drawCircles()
{
	var pos = start;
	var rgb = nc.toRgb();
	layer.clear();
	for(led = 0; led < leds; led++)
	{
		if(led < start-1 || led > start+1)
		{
			circles[led].fill("#000000");
		}
		else if(led == (start-1) || led == (start+1) )
		{
			var c = tinycolor(nc.toRgb());
			circles[led].fill("#"+c.darken(10).toHex());
		}
		else if(led == start)
		{
			circles[led].fill("#"+nc.toHex());
		}
		layer.add(circles[led]);
	}
	layer.draw();

	LedController.setColor(rgb, {first: pos, count: 3});
}
});
*/
