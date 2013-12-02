/*global define:true*/
/**
 * Модель карты
 */
define([
	'underscore', 'Browser', 'Utils', 'socket!', 'Params', 'knockout', 'knockout.mapping', 'm/_moduleCliche', 'globalVM', 'renderer',
	'model/User', 'model/storage', 'Locations',
	'leaflet', 'lib/leaflet/extends/L.neoMap', 'm/map/marker',
	'text!tpl/map/map.jade', 'css!style/map/map',
	'jquery-ui/draggable', 'jquery-ui/slider', 'jquery-ui/effect-highlight',
	'css!style/jquery/ui/core', 'css!style/jquery/ui/theme', 'css!style/jquery/ui/slider'
], function (_, Browser, Utils, socket, P, ko, ko_mapping, Cliche, globalVM, renderer, User, storage, Locations, L, Map, MarkerManager, jade) {
	'use strict';

	return Cliche.extend({
		jade: jade,
		options: {
			embedded: undefined, // Режим встроенной карты
			editing: undefined, // Режим редактирования
			point: undefined,
			center: undefined,
			dfdWhenReady: undefined // Deffered witch will be resolved when map ready

		},
		create: function () {
			this.destroy = _.wrap(this.destroy, this.localDestroy);

			// Modes
			this.embedded = this.options.embedded;
			this.editing = ko.observable(this.options.editing);
			this.openNewTab = ko.observable(!this.embedded);

			// Map objects
			this.map = null;
			this.mapDefCenter = new L.LatLng(Locations.current.lat, Locations.current.lng);
			this.layers = ko.observableArray();
			this.layersOpen = ko.observable(false);
			this.layerActive = ko.observable({sys: null, type: null});
			this.layerActiveDesc = ko.observable('');

			this.markerManager = null;

			//Если карта встроена, то создаем точку для выделения и слой, куда её добавить
			if (this.embedded) {
				this.point = this.options.point; // Точка для выделения
				this.pointLayer = L.layerGroup();
			}

			this.yearLow = 1826;
			this.yearHigh = 2000;
			this.yearRefreshMarkersBind = this.yearRefreshMarkers.bind(this);
			this.yearRefreshMarkersTimeout = null;

			this.infoShow = ko.observable(true);

			if (P.settings.USE_OSM_API()) {
				this.layers.push({
					id: 'osm',
					desc: 'OSM',
					selected: ko.observable(false),
					types: ko.observableArray([
						{
							id: 'osmosnimki',
							desc: 'Kosmosnimki',
							selected: ko.observable(false),
							obj: new L.TileLayer('http://{s}.tile.osm.kosmosnimki.ru/kosmo/{z}/{x}/{y}.png', {updateWhenIdle: false, maxZoom: 20, maxNativeZoom: 18}),
							maxZoom: 20,
							limitZoom: 19,
							maxAfter: 'google.scheme'
						},
						{
							id: 'mapnik',
							desc: 'Mapnik',
							selected: ko.observable(false),
							obj: new L.TileLayer('http://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {updateWhenIdle: false, maxZoom: 20}),
							maxZoom: 20,
							limitZoom: 19,
							maxAfter: 'google.scheme'
						},
						{
							id: 'mapquest',
							desc: 'Mapquest',
							selected: ko.observable(false),
							obj: new L.TileLayer('http://otile1.mqcdn.com/tiles/1.0.0/osm/{z}/{x}/{y}.png', {updateWhenIdle: false, maxZoom: 20, maxNativeZoom: 18}),
							maxZoom: 20,
							limitZoom: 19,
							maxAfter: 'google.scheme'
						}
					])
				});
			}
			if (P.settings.USE_GOOGLE_API()) {
				this.layers.push({
					id: 'google',
					desc: 'Google',
					deps: 'lib/leaflet/extends/L.Google',
					selected: ko.observable(false),
					types: ko.observableArray([
						{
							id: 'scheme',
							desc: 'Схема',
							selected: ko.observable(false),
							params: 'ROADMAP',
							maxZoom: 20
						},
						{
							id: 'sat',
							desc: 'Спутник',
							selected: ko.observable(false),
							params: 'SATELLITE',
							maxZoom: 19
						},
						{
							id: 'hyb',
							desc: 'Гибрид',
							selected: ko.observable(false),
							params: 'HYBRID',
							maxZoom: 19
						},
						{
							id: 'land',
							desc: 'Ландшафт',
							selected: ko.observable(false),
							params: 'TERRAIN',
							maxZoom: 16,
							limitZoom: 15,
							maxAfter: 'google.scheme'
						}
					])
				});
			}
			if (P.settings.USE_YANDEX_API()) {
				this.layers.push({
					id: 'yandex',
					desc: 'Яндекс',
					deps: 'lib/leaflet/extends/L.Yandex',
					selected: ko.observable(false),
					types: ko.observableArray([
						{
							id: 'scheme',
							desc: 'Схема',
							selected: ko.observable(false),
							params: 'map',
							maxZoom: 18,
							limitZoom: 17,
							maxAfter: 'yandex.pub'
						},
						{
							id: 'sat',
							desc: 'Спутник',
							selected: ko.observable(false),
							params: 'satellite',
							maxZoom: 19
						},
						{
							id: 'hyb',
							desc: 'Гибрид',
							selected: ko.observable(false),
							params: 'hybrid',
							maxZoom: 19
						},
						{
							id: 'pub',
							desc: 'Народная',
							selected: ko.observable(false),
							params: 'publicMap',
							maxZoom: 20,
							limitZoom: 19,
							maxAfter: 'google.scheme'
						},
						{
							id: 'pubhyb',
							desc: 'Народный гибрид',
							selected: ko.observable(false),
							params: 'publicMapHybrid',
							maxZoom: 20,
							limitZoom: 19,
							maxAfter: 'google.scheme'
						}
					])
				});
			}

			ko.applyBindings(globalVM, this.$dom[0]);

			// Subscriptions
			this.subscriptions.edit = this.editing.subscribe(this.editHandler, this);
			this.subscriptions.sizes = P.window.square.subscribe(this.sizesCalc, this);
			this.subscriptions.openNewTab = this.openNewTab.subscribe(function (val) {
				if (this.markerManager) {
					this.markerManager.openNewTab = val;
				}
			}, this);

			this.show();
		},

		show: function () {
			var center = this.point && this.point.geo() || this.options.center || this.mapDefCenter;

			this.map = new L.neoMap(this.$dom.find('.map')[0], {center: center, zoom: this.embedded ? 18 : Locations.current.z, minZoom: 3, zoomAnimation: L.Map.prototype.options.zoomAnimation && true, trackResize: false});
			this.markerManager = new MarkerManager(this.map, {enabled: false, openNewTab: this.openNewTab(), embedded: this.embedded});
			this.selectLayer('osm', 'osmosnimki');

			Locations.subscribe(function (val) {
				this.mapDefCenter = new L.LatLng(val.lat, val.lng);
				this.setMapDefCenter(true);
			}.bind(this));

			renderer(
				[
					{module: 'm/map/navSlider', container: '.mapNavigation', options: {map: this.map, maxZoom: this.layerActive().type.limitZoom || this.layerActive().type.maxZoom, canOpen: !this.embedded}, ctx: this, callback: function (vm) {
						this.childModules[vm.id] = vm;
						this.navSliderVM = vm;
					}.bind(this)}
				],
				{
					parent: this,
					level: this.level + 1
				}
			);

			this.map
				.on('zoomend', this.zoomEndCheckLayer, this)
				.whenReady(function () {
					if (this.embedded) {
						this.map.addLayer(this.pointLayer);
					}
					this.editHandler(this.editing());

					this.yearSliderCreate();

					globalVM.func.showContainer(this.$container);

					if (this.options.dfdWhenReady && Utils.isType('function', this.options.dfdWhenReady.resolve)) {
						window.setTimeout(this.options.dfdWhenReady.resolve.bind(this.options.dfdWhenReady), 100);
					}
				}, this);

			this.showing = true;
		},
		hide: function () {
			globalVM.func.hideContainer(this.$container);
			this.showing = false;
		},
		localDestroy: function (destroy) {
			this.pointHighlightDestroy().pointEditDestroy().markerManager.destroy();
			this.map.off('moveend');
			this.map.remove();
			delete this.point;
			delete this.map;
			delete this.markerManager;
			destroy.call(this);
		},
		sizesCalc: function () {
			this.map.whenReady(this.map._onResize, this.map); //Самостоятельно обновляем размеры карты
		},

		// Обработчик переключения режима редактирования
		editHandler: function (edit) {
			if (edit) {
				this.pointHighlightDestroy().pointEditCreate().markerManager.disable();
			} else {
				this.pointEditDestroy().pointHighlightCreate().markerManager.enable();
			}
		},
		// Включает режим редактирования
		editPointOn: function () {
			this.editing(true);
			return this;
		},
		// Выключает режим редактирования
		editPointOff: function () {
			this.editing(false);
			return this;
		},

		setPoint: function (point) {
			var geo = point.geo();

			this.point = point;
			if (this.editing()) {
				if (this.pointMarkerEdit) {
					if (geo) {
						this.pointMarkerEdit.setLatLng(geo);
					} else {
						this.pointEditMarkerDestroy();
					}
				} else if (geo) {
					this.pointEditMarkerCreate();
				}
			} else {
				this.pointHighlightCreate();
			}
			if (geo) {
				this.map.panTo(geo);
			}
			return this;
		},
		delPointGeo: function () {
			this.pointHighlightDestroy().pointEditMarkerDestroy().point.geo(null);
		},

		//Создает подсвечивающий маркер для point, если координаты точки есть
		pointHighlightCreate: function () {
			this.pointHighlightDestroy();
			if (this.point && this.point.geo()) {
				var divIcon = L.divIcon({
					className: 'photoIcon highlight ' + 'y' + this.point.year() + ' ' + this.point.dir(),
					iconSize: new L.Point(8, 8)
				});
				this.pointMarkerHL = L.marker(this.point.geo(), {zIndexOffset: 10000, draggable: false, title: this.point.title(), icon: divIcon, riseOnHover: true});
				this.pointLayer.addLayer(this.pointMarkerHL);
			}
			return this;
		},
		pointHighlightDestroy: function () {
			if (this.pointMarkerHL) {
				this.pointLayer.removeLayer(this.pointMarkerHL);
				delete this.pointMarkerHL;
			}
			return this;
		},

		// Создает редактирующий маркер, если координаты точки есть, а если нет, то создает по клику на карте
		pointEditCreate: function () {
			this.pointEditDestroy();
			if (this.point) {
				if (this.point.geo()) {
					this.pointEditMarkerCreate();
				}
				this.map.on('click', function (e) {
					var geo = Utils.geo.geoToPrecision([e.latlng.lat, e.latlng.lng]);

					this.point.geo(geo);

					if (this.pointMarkerEdit) {
						this.pointMarkerEdit.setLatLng(geo);
					} else {
						this.pointEditMarkerCreate();
					}
				}, this);
			}
			return this;
		},
		pointEditDestroy: function () {
			this.pointEditMarkerDestroy();
			this.map.off('click');
			return this;
		},
		pointEditMarkerCreate: function () {
			var _this = this;
			this.pointMarkerEdit = L.marker(this.point.geo(), {draggable: true, title: 'Точка съемки', icon: L.icon({iconSize: [26, 43], iconAnchor: [13, 36], iconUrl: '/img/map/pinEdit.png', className: 'pointMarkerEdit'})})
				.on('dragend', function () {
					var latlng = Utils.geo.geoToPrecision(this.getLatLng());
					_this.point.geo([latlng.lat, latlng.lng]);
				})
				.addTo(this.pointLayer);
			return this;
		},
		pointEditMarkerDestroy: function () {
			if (this.pointMarkerEdit) {
				this.pointMarkerEdit.off('dragend');
				this.pointLayer.removeLayer(this.pointMarkerEdit);
				delete this.pointMarkerEdit;
			}
			return this;
		},

		setMapDefCenter: function (forceMoveEvent) {
			this.map.setView(this.mapDefCenter, Locations.current.z, false);
		},
		zoomEndCheckLayer: function () {
			var limitZoom = this.layerActive().type.limitZoom,
				maxAfter = this.layerActive().type.maxAfter,
				layers;
			if (limitZoom !== undefined && maxAfter !== undefined && this.map.getZoom() > limitZoom) {
				layers = maxAfter.split('.');
				if (this.layerActive().sys.id === 'osm') {
					this.layerActive().type.obj.on('load', function (evt) {
						this.selectLayer(layers[0], layers[1]);
					}, this);
				} else {
					window.setTimeout(_.bind(this.selectLayer, this, layers[0], layers[1]), 500);
				}

			}
		},
		toggleLayers: function (vm, event) {
			this.layersOpen(!this.layersOpen());
		},
		selectLayer: function (sys_id, type_id) {
			var layers = this.layers(),
				layerActive = this.layerActive(),
				system,
				type,
				setLayer = function (type) {
					this.map.addLayer(type.obj);
					this.markerManager.layerChange();
					this.map.options.maxZoom = type.maxZoom;
					if (this.navSliderVM && Utils.isType('function', this.navSliderVM.recalcZooms)) {
						this.navSliderVM.recalcZooms(type.limitZoom || type.maxZoom, true);
					}
					if (type.limitZoom !== undefined && this.map.getZoom() > type.limitZoom) {
						this.map.setZoom(type.limitZoom);
					} else if (this.map.getZoom() > type.maxZoom) {
						this.map.setZoom(type.maxZoom);
					}
				}.bind(this);

			if (layerActive.sys && layerActive.sys.id === sys_id && layerActive.type.id === type_id) {
				return;
			}

			system = _.find(layers, function (item) {
				return item.id === sys_id;
			});

			if (system) {
				type = _.find(system.types(), function (item) {
					return item.id === type_id;
				});

				if (type) {
					if (layerActive.sys && layerActive.type) {
						layerActive.sys.selected(false);
						layerActive.type.selected(false);
						if (layerActive.sys.id === 'osm') {
							layerActive.type.obj.off('load');
						}
						this.map.removeLayer(layerActive.type.obj);
					}

					system.selected(true);
					type.selected(true);
					this.layerActiveDesc(this.embedded ? system.desc : system.desc + ': ' + type.desc);
					this.layerActive({sys: system, type: type});

					if (system.deps && !type.obj) {
						require([system.deps], function (Construct) {
							type.obj = new Construct(type.params);
							setLayer(type);
							type = null;
						}.bind(this));
					} else {
						setLayer(type);
					}
				}
			}

			layers = system = null;
		},

		yearSliderCreate: function () {
			var _this = this,
				yearsDelta = this.yearHigh - this.yearLow,
				$slider = this.$dom.find('.yearSlider'),
				sliderStep = $slider.width() / yearsDelta,
				slideOuterL = this.$dom.find('.yearOuter.L')[0],
				slideOuterR = this.$dom.find('.yearOuter.R')[0],
				handleL = $slider[0].querySelector('.ui-slider-handle.L'),
				handleR = $slider[0].querySelector('.ui-slider-handle.R'),
				currMin,
				currMax,
				culcSlider = function (min, max) {
					if (currMin !== min) {
						slideOuterL.style.width = (sliderStep * (min - 1826) >> 0) + 'px';
						handleL.innerHTML = currMin = min;
					}
					if (currMax !== max) {
						slideOuterR.style.width = (sliderStep * (2000 - max) >> 0) + 'px';
						handleR.innerHTML = currMax = max;
					}
				};

			$slider.slider({
				range: true,
				min: this.yearLow,
				max: this.yearHigh,
				step: 1,
				values: [this.yearLow, this.yearHigh],
				create: function () {
					var values = $slider.slider("values");
					culcSlider(values[0], values[1]);
				},
				start: function () {
					window.clearTimeout(_this.yearRefreshMarkersTimeout);
				},
				slide: function (event, ui) {
					culcSlider(ui.values[0], ui.values[1]);
				},
				change: function (event, ui) {
					culcSlider(ui.values[0], ui.values[1]);
					_this.yearLow = currMin;
					_this.yearHigh = currMax;
					_this.yearRefreshMarkersTimeout = window.setTimeout(_this.yearRefreshMarkersBind, 400);
				}
			});

			//Подписываемся на изменение размеров окна для пересчета шага и позиций покрывал
			this.subscriptions.sizeSlider = P.window.square.subscribe(function () {
				var values = $slider.slider("values");

				sliderStep = $slider.width() / yearsDelta;
				slideOuterL.style.width = (sliderStep * (values[0] - 1826) >> 0) + 'px';
				slideOuterR.style.width = (sliderStep * (2000 - values[1]) >> 0) + 'px';
			});
		},
		yearRefreshMarkers: function () {
			this.markerManager.setYearLimits(this.yearLow, this.yearHigh);
		}
	});
});