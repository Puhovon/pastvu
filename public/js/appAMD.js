requirejs.config({
	baseUrl: '/js',
	waitSeconds: 15,
	deps: ['./JSExtensions'],
	callback: function() {
		console.timeStamp('AMD depends loaded');
	},
	map: {
		'*': {
			'knockout': 'knockout-2.1.0',
			'knockout.mapping': 'knockout.mapping-latest',
			'leaflet': 'leaflet_0.4.0'
		}
	},
	paths: {
		'domReady': 'require_plugins/domReady',
		'async': 'require_plugins/async',
		'goog': 'require_plugins/goog'
	},
	shim: {
		'socket':{
            deps: ['/socket.io/socket.io.js'],
            exports: 'socket'
		}
	}
});
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

require(
['domReady', 'jquery', 'knockout', 'knockout.mapping', 'Browser', 'Utils', 'socket', 'EventTypes', 'mvvm/GlobalParams', 'mvvm/i18n', 'leaflet', 'L.Google', 'Locations'],
function(domReady, $, ko, ko_mapping, Browser, Utils, socket, ET, GlobalParams, i18n, L, LGoogle, Locations) {
	console.timeStamp('Require app Ready');
	var map, layers = {}, curr_lay = {sys: null, type: null},
		mapDefCenter = new L.LatLng(Locations.current.lat, Locations.current.lng),
		poly_mgr, aoLayer,
		navSlider,
		login, reg, recall;
	
	$.when(LoadParams(), waitForDomReady())
	 .then(app);
	
	function waitForDomReady() {
		var dfd = $.Deferred();
		domReady(function(){console.timeStamp('Dom Ready'); dfd.resolve();})
		return dfd.promise();
	}
	function LoadParams(){
		var dfd = $.Deferred();
		socket.on('takeGlobeParams', function (json) {
			ko_mapping.fromJS(json, GlobalParams);
			dfd.resolve();
		});
		socket.emit('giveGlobeParams');
		return dfd.promise();
	}
	
	function app () {
		
		login = {
			head: document.querySelector('#login_fringe .head'),
			form: document.querySelector('#login_fringe form'),
			wait: document.querySelector('#login_fringe .wait'),
			mess: document.querySelector('#login_fringe .mess'),
			messchild: document.querySelector('#login_fringe .mess > div')
		};
		reg = {
			head: document.querySelector('#reg_fringe .head'),
			form: document.querySelector('#reg_fringe form'),
			wait: document.querySelector('#reg_fringe .wait'),
			mess: document.querySelector('#reg_fringe .mess'),
			messchild: document.querySelector('#reg_fringe .mess > div')
		};
		recall = {
			head: document.querySelector('#recall_fringe .head'),
			form: document.querySelector('#recall_fringe form'),
			wait: document.querySelector('#recall_fringe .wait'),
			mess: document.querySelector('#recall_fringe .mess'),
			messchild: document.querySelector('#recall_fringe .mess > div')
		};
		
		
		createMap();
		navSlider = new navigationSlider(document.querySelector('#nav_panel #nav_slider_area'));
	}
	
	function createMap() {
		if (GlobalParams.USE_OSM_API()) {
			layers.osm = {
				desc: 'OSM',
				types: {
					osmosnimki: {
						desc:'Osmosnimki',
						iColor:'black',
						obj: new L.TileLayer('http://{s}.tile.osmosnimki.ru/kosmo/{z}/{x}/{y}.png')
					},
					mapnik: {
						desc:'Mapnik',
						iColor:'black',
						obj: new L.TileLayer('http://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png')
					},
					mapquest: {
						desc:'Mapquest',
						iColor:'black',
						obj: new L.TileLayer('http://otile1.mqcdn.com/tiles/1.0.0/osm/{z}/{x}/{y}.png', {attribution:'Tiles Courtesy of <a href="http://www.mapquest.com/" target="_blank">MapQuest</a> <img src="http://developer.mapquest.com/content/osm/mq_logo.png">'})
					}
				}
			};
		}
		if (GlobalParams.USE_GOOGLE_API()) {
			layers.google = {
				desc: 'Google',
				types: {
					scheme: {
						desc:'Схема',
						iColor:'black',
						obj: new L.Google('ROADMAP')
					},
					sat: {
						desc:'Спутник',
						iColor:'black',//'white',
						obj: new L.Google('SATELLITE')
					},
					hyb: {
						desc:'Гибрид',
						iColor:'black',//'white',
						obj: new L.Google('HYBRID')
					},
					land: {
						desc:'Ландшафт',
						iColor:'black',
						obj: new L.Google('TERRAIN')
					}
				}
			};
		}

		function getSystemTypesObjs(sys){
			var ret = new Array();
			for (var typ in layers[sys].types){
				if (!layers[sys].types.hasOwnProperty(typ)) continue;
				ret.push(layers[sys].types[typ].obj);
			}
		}

		var layersArr = [];
		var systems = document.createDocumentFragment(), sysElem, typeElem, sysNum = 0;

		for (var lay in layers){
			if (!layers.hasOwnProperty(lay)) continue;
			
			sysElem = $('<div/>',  {id : lay});
			sysElem.append($('<span/>', {'class': 'head', 'html': layers[lay].desc}));
			for (var type in layers[lay].types) {
				if (!layers[lay].types.hasOwnProperty(type)) continue;
				typeElem = $('<div/>', {html: layers[lay].types[type].desc, 'maptp': type}).appendTo(sysElem);
				Utils.Event.add(typeElem[0], 'click', function(event, s, t){
					SelectLayer(s, t);
				}.neoBind(typeElem[0], [lay, type]));
				layers[lay].types[type].dom = typeElem[0];
				layersArr.push(layers[lay].types[type].obj);
			}
			systems.appendChild(sysElem[0]);
			sysNum++;
		}

		document.querySelector('#layers_panel #systems').appendChild(systems);
		document.querySelector('#layers_panel #systems').classList.add('s'+sysNum);

		
		Locations.subscribe(function(val){
			mapDefCenter = new L.LatLng(val.lat, val.lng);
			setMapDefCenter(true);
		});
		map = new L.Map('map', {center: mapDefCenter, zoom: Locations.current.z});
		
		if (!!window.localStorage && !! window.localStorage['arguments.SelectLayer']) {
			SelectLayer.apply(this, window.localStorage['arguments.SelectLayer'].split(','))
		} else {
			if (layers.yandex) SelectLayer('yandex', 'scheme');
			else SelectLayer('osm', 'osmosnimki');
		}
	}
	
	function SelectLayer(sys_id, type_id){
		if (!layers.hasOwnProperty(sys_id)) return;
		var sys = layers[sys_id];
		if (!sys.types.hasOwnProperty(type_id)) return;
		var type = sys.types[type_id];
		
		if (curr_lay.sys && curr_lay.type){
			var prev_selected = document.querySelector('#layers_panel #systems > div > div.selected');
			if (prev_selected){
				prev_selected.parentNode.firstChild.classList.remove('selected');
				prev_selected.classList.remove('selected');
			}
			
			if (curr_lay.type.iColor != type.iColor){
				document.querySelector('#main').classList.remove(curr_lay.type.iColor);
				document.querySelector('#main').classList.add(type.iColor);
			}
			
			map.removeLayer(curr_lay.type.obj);
		}else{
			document.querySelector('#main').classList.add(type.iColor);
		}

		type.dom.parentNode.firstChild.classList.add('selected');
		type.dom.classList.add('selected');
		document.querySelector('#current').innerHTML = sys.desc+': '+type.desc;
		
		if (!!window.localStorage) {
			window.localStorage['arguments.SelectLayer'] = Array.prototype.slice.call(arguments).join(',');
		}
		curr_lay.sys = sys; curr_lay.type = type;
		map.addLayer(type.obj);
	}


	
});