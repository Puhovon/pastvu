/**
 * Global vars
 */
var map, layers = {}, curr_lay = {sys: null, type: null},
	mapDefCenter = new L.LatLng(55.7418, 37.61),
	cams = {},
	playingFormat, mapDefCenter,
	poly_mgr, marker_mgr,
	markersLayer, aoLayer,
	navSlider,
	login, chpass, reg, recall, search,
	mediaContainerManager,
	infoFringe, infoC, infoCInitH, ScrollUp, ScrollDown,
	flag_current, flags_available,
	maxVideoPlaybackTime = 0;
	
/**
 * Event Types
 */
var ET = {
	mup: (Browser.support.touch ? 'touchend' : 'mouseup'),
	mdown: (Browser.support.touch ? 'touchstart' : 'mousedown'),
	mmove: (Browser.support.touch ? 'touchmove' : 'mousemove')
}
	
function app() {
	GlobalParamsToKO();
	Utils.Event.add(window, 'resize', function(){GlobalParamsVM.Width(Utils.getClientWidth()); GlobalParamsVM.Height(Utils.getClientHeight());});
	
	infoFringe = document.querySelector('#info_fringe');
	infoC = document.querySelector('#info_content');
	infoCInitH = infoC.scrollHeight;
	ScrollUp = document.querySelector('#info_up');
	ScrollDown = document.querySelector('#info_down');
	flag_current = document.querySelector('#flag_current');
	flags_available = document.querySelector('#flags_available');
	
	mediaContainerManager = new MediaContainerManager(GlobalParamsVM.MULTI_VIEW());
	
	login = {
		head: document.querySelector('#login_back #login_body .head'),
		form: document.querySelector('#login_back #login_body form'),
		wait: document.querySelector('#login_back #login_body .wait'),
		mess: document.querySelector('#login_back #login_body .mess')
	};
	reg = {
		head: document.querySelector('#login_back #reg_body .head'),
		form: document.querySelector('#login_back #reg_body form'),
		wait: document.querySelector('#login_back #reg_body .wait'),
		mess: document.querySelector('#login_back #reg_body .mess')
	};
	recall = {
		head: document.querySelector('#login_back #recall_body .head'),
		form: document.querySelector('#login_back #recall_body form'),
		wait: document.querySelector('#login_back #recall_body .wait'),
		mess: document.querySelector('#login_back #recall_body .mess')
	};
	chpass = {
		head: document.querySelector('#changepass_back #changepass_body .head'),
		form: document.querySelector('#changepass_back #changepass_body form'),
		wait: document.querySelector('#changepass_back #changepass_body .wait'),
		mess: document.querySelector('#changepass_back #changepass_body .mess')
	};
	search = {
		SearchArrow: document.querySelector('#searchArrow'),
		SearchInput: document.querySelector('#SearchInput'),
		searchClear: document.querySelector('#searchClear'),
	};
	
	Utils.Event.add(search.SearchInput, 'focus', srchFocus);
	Utils.Event.add(search.SearchInput, 'blur', srchBlur);
	
	createMap();
	
	InitLocales();
	navSlider = new navigationSlider(document.querySelector('#nav_panel #nav_slider_area'));
	
	markersLayer = new L.LayerGroup();
	map.addLayer(markersLayer);
	marker_mgr = new MarkerManager(map, {layer: markersLayer});
	
	aoLayer = new L.LayerGroup();
	map.addLayer(aoLayer);
	poly_mgr = new PolygonManager(map, {layer: aoLayer});
	
	$.when(LoadAOs(), LoadCams()).done(DrawObjects);	
	
	MakeKnokout();
	SessionUpdater();
	if(window.KeyHandler) window.KeyHandler();
}
function DrawObjects(){
	LoaderIncrement(4);
	window.setTimeout(function(){
		DrawCams();
		LoaderIncrement(7);
		window.setTimeout(function(){
			poly_mgr.refresh(true);
			LoaderIncrement(7, true);
			if(!$.urlParam('stopOnLoad')) window.setTimeout(function(){removeLoader(); document.querySelector('#main').style.opacity = '1';}, 500);
		},50);
	},50);	
}

function createMap() {
	if (GlobalParams.USE_OSM_API) {
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
	/*if (GlobalParams.USE_YANDEX_API) {
		layers.yandex = {
			desc: 'Яндекс',
			types: {
				scheme: {
					desc:'Схема',
					iColor:'black',
					obj: new OpenLayers.Layer.Yandex("Яндекс Схема", {type:YMaps.MapType.MAP, sphericalMercator: true})
				},
				sat: {
					desc:'Спутник',
					iColor:'black',
					obj: new OpenLayers.Layer.Yandex("Яндекс Спутник", {type:YMaps.MapType.SATELLITE, sphericalMercator: true})
				},
				hyb: {
					desc:'Гибрид',
					iColor:'black',
					obj: new OpenLayers.Layer.Yandex("Яндекс Гибрид", {type:YMaps.MapType.HYBRID, sphericalMercator: true})
				}
			}
		};
	}*/
	if (GlobalParams.USE_GOOGLE_API) {
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

	
	map = new L.Map('map', {center: mapDefCenter, zoom: (Utils.getClientHeight()>Utils.getClientWidth() ? 11: 10)});
	if (!map.getCenter()) {
		setMapDefCenter();
	}
	
	if (!!window.localStorage && !! window.localStorage['arguments.SelectLayer']) {
		SelectLayer.apply(this, window.localStorage['arguments.SelectLayer'].split(','))
	} else {
		if (layers.yandex) SelectLayer('yandex', 'scheme');
		else SelectLayer('osm', 'osmosnimki');
	}
}

function setMapDefCenter(forceMoveEvent){
	map.setView(mapDefCenter, (Utils.getClientHeight()>Utils.getClientWidth() ? 11: 10), false);
	//При setCenter срабатывает только событие смены зума, без moveend, поэтому сами вызываем событие у полигона
	if(forceMoveEvent) poly_mgr.onMapMoveEnd();
}

function SuperHome(){
	setMapDefCenter(true);
	if (layers.yandex) SelectLayer('yandex', 'scheme');
	else SelectLayer('osm', 'osmosnimki');
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

function ChangeZoom(diff){
	map.setZoom(map.getZoom()+diff);
}

var deltaH, deltaV;
function calcDelta(){
	deltaH = Math.floor(Utils.getClientWidth()/4),
	deltaV = Math.floor(Utils.getClientHeight()/4);
}
calcDelta(); Utils.Event.add(window, 'resize', calcDelta);
function mapUp() {
	map.panBy(new L.Point(0, -1*deltaV));
}
function mapDown() {
	map.panBy(new L.Point(0, deltaV));
}
function mapLeft() {
	map.panBy(new L.Point(-1*deltaH, 0));
}
function mapRight() {
	map.panBy(new L.Point(deltaH, 0));
}
keyTarget.push({
	id: 'mapArrows',
	source: window,
	stopFurther: true,
	onUp: mapUp, onUpHoldStart: upHoldStart, onUpHoldEnd: holdEnd,
	onDown: mapDown, onDownHoldStart: downHoldStart, onDownHoldEnd: holdEnd,
	onLeft: mapLeft, onLeftHoldStart: leftHoldStart, onLeftHoldEnd: holdEnd,
	onRight: mapRight, onRightHoldStart: rightHoldStart, onRightHoldEnd: holdEnd
});
var holdStart, holdTimeout;
!function holdRecursionScope(){
	var delay;
	function holdRecursion(funcToExec) {
		if(!Utils.isObjectType('function', funcToExec)){
			funcToExec = arguments[arguments.length-2];
		}
		funcToExec.call(this);
		//if (delay > 500) delay -= 100;
		holdTimeout = window.setTimeout(arguments[arguments.length-1], delay);
	}
	
	holdStart = function (func) {
		holdEnd();
		delay = 500;
		holdTimeout = window.setTimeout(holdRecursion.neoBind(this, [func]), delay);
	}
}();
function upHoldStart() {holdStart(mapUp);}
function downHoldStart() {holdStart(mapDown);}
function leftHoldStart() {holdStart(mapLeft);}
function rightHoldStart() {holdStart(mapRight);}
function holdEnd() {
	if(holdTimeout){
		window.clearTimeout(holdTimeout);
		holdTimeout = null;
	}
}

function ShowPanel(id){
	var showing = document.getElementById(id);
	var anotherPanels = new Array();
	if(id!='nav_panel') anotherPanels.push(document.querySelector('#nav_panel'));
	if(id!='info_fringe') anotherPanels.push(document.querySelector('#info_fringe'));
	if(id!='user_panel_fringe') anotherPanels.push(document.querySelector('#user_panel_fringe'));
	if(id!='layers_fringe') anotherPanels.push(document.querySelector('#layers_fringe'));
	for (var p = 0; p<anotherPanels.length; p++){
		if (anotherPanels[p].classList.contains('show')) anotherPanels[p].classList.remove('show');
	}
	showing.classList.toggle('show');
	if(id=='info_fringe' && showing.querySelector('#info').classList.contains('closed')) OpenInfo(showing.querySelector('#info'));
	if(id=='layers_fringe' && !showing.classList.contains('open')) showing.querySelector('#layers_panel').classList.add('open');
}

var ScrollinfoInterval = null;
function ScrollMediaImgs(dir, step, wheel){
	if(dir=='down' && infoC.scrollTop< infoC.scrollHeight-infoC.offsetHeight){
		infoC.scrollTop += step;
	}else if (dir=='up' && infoC.scrollTop!=0){
		infoC.scrollTop -= step;
	}else if (!wheel) {ScrollMediaImgsOff(); return;}
	
	if(infoC.scrollTop==0){
		ScrollUp.classList.add('noScroll');
	}else{
		ScrollUp.classList.remove('noScroll');
	}
	if(infoC.scrollTop>=infoC.scrollHeight-infoC.offsetHeight){
		ScrollDown.classList.add('noScroll');
	}else{
		ScrollDown.classList.remove('noScroll');
	}
}
function ScrollMediaImgsOn(dir){
	ScrollinfoInterval = window.setInterval(function(){ScrollMediaImgs(dir, 10);},60);
}
function ScrollMediaImgsOff(){
	if(ScrollinfoInterval != null) clearInterval(ScrollinfoInterval);
	ScrollinfoInterval = null;
}

function OnWheel(e){
	var dir;
	if(e.type=='DOMMouseScroll') dir = -1*e.detail;
	else dir = e.wheelDelta;
	if(dir>0) dir = 'up';
	else dir = 'down';
	ScrollMediaImgs(dir, 12, true);
	return false;
}

var infoOpened = false;
function OpenInfo(info){

	if(infoOpened){
		Utils.Event.removeAll(infoC);
		Utils.Event.removeAll(ScrollUp);
		Utils.Event.removeAll(ScrollDown);
		info.classList.add('closed');
		infoC.classList.remove('scroll');
		ScrollUp.classList.remove('show');
		ScrollDown.classList.remove('show');
		Utils.Event.remove(window, 'resize', InfoResize);
	}else{
		infoC.scrollTop = 0;
		InfoResize();
		
		Utils.Event.add(infoC, 'mousewheel', OnWheel);
		Utils.Event.add(infoC, 'DOMMouseScroll', OnWheel); //Mozilla
		Utils.Event.add(ScrollUp, 'mousedown', function(){ScrollMediaImgsOn('up')});
		Utils.Event.add(ScrollUp, 'touchstart', function(){ScrollMediaImgsOn('up')});
		Utils.Event.add(ScrollUp, 'mouseup', ScrollMediaImgsOff);
		Utils.Event.add(ScrollUp, 'touchend', ScrollMediaImgsOff);
		Utils.Event.add(ScrollDown, 'mousedown', function(){ScrollMediaImgsOn('down')});
		Utils.Event.add(ScrollDown, 'touchstart', function(){ScrollMediaImgsOn('down')});
		Utils.Event.add(ScrollDown, 'mouseup', ScrollMediaImgsOff);
		Utils.Event.add(ScrollDown, 'touchend', ScrollMediaImgsOff);
		
		Utils.Event.add(window, 'resize', InfoResize);
		info.classList.remove('closed');
	}
	
	infoOpened = !infoOpened;
}

function InfoResize() {
	var maxH = Utils.getClientHeight() - 86 - infoFringe.offsetTop;
	infoCInitH = infoC.scrollHeight;
	if (infoCInitH < maxH){
		infoC.style.height = infoCInitH + 'px';
		infoC.classList.remove('scroll');
		ScrollUp.classList.remove('show');
		ScrollDown.classList.remove('show');
		return false;
	}else {
		maxH -= 33;
		infoC.style.height = maxH + 'px';
		infoC.classList.add('scroll');
		ScrollUp.classList.add('show');
		ScrollDown.classList.add('show');
		return true;
	}
}

function ShowPanel(id){
	var showing = document.getElementById(id);
	var anotherPanels = new Array();
	if(id!='nav_panel') anotherPanels.push(document.querySelector('#nav_panel'));
	if(id!='info_fringe') anotherPanels.push(document.querySelector('#info_fringe'));
	if(id!='user_panel_fringe') anotherPanels.push(document.querySelector('#user_panel_fringe'));
	if(id!='layers_fringe') anotherPanels.push(document.querySelector('#layers_fringe'));
	for (var p = 0; p<anotherPanels.length; p++){
		if (anotherPanels[p].classList.contains('show')) anotherPanels[p].classList.remove('show');
	}
	showing.classList.toggle('show');
	if(id=='info_fringe' && showing.querySelector('#info').classList.contains('closed')) OpenInfo(showing.querySelector('#info'));
	if(id=='layers_fringe' && !showing.classList.contains('open')) showing.querySelector('#layers_panel').classList.add('open');
}

var ScrollinfoInterval = null;
function ScrollMediaImgs(dir, step, wheel){
	if(dir=='down' && infoC.scrollTop< infoC.scrollHeight-infoC.offsetHeight){
		infoC.scrollTop += step;
	}else if (dir=='up' && infoC.scrollTop!=0){
		infoC.scrollTop -= step;
	}else if (!wheel) {ScrollMediaImgsOff(); return;}
	
	if(infoC.scrollTop==0){
		ScrollUp.classList.add('noScroll');
	}else{
		ScrollUp.classList.remove('noScroll');
	}
	if(infoC.scrollTop>=infoC.scrollHeight-infoC.offsetHeight){
		ScrollDown.classList.add('noScroll');
	}else{
		ScrollDown.classList.remove('noScroll');
	}
}
function ScrollMediaImgsOn(dir){
	ScrollinfoInterval = window.setInterval(function(){ScrollMediaImgs(dir, 10);},60);
}
function ScrollMediaImgsOff(){
	if(ScrollinfoInterval != null) clearInterval(ScrollinfoInterval);
	ScrollinfoInterval = null;
}

function OnWheel(e){
	var dir;
	if(e.type=='DOMMouseScroll') dir = -1*e.detail;
	else dir = e.wheelDelta;
	if(dir>0) dir = 'up';
	else dir = 'down';
	ScrollMediaImgs(dir, 12, true);
	return false;
}

var infoOpened = false;
function OpenInfo(info){

	if(infoOpened){
		Utils.Event.removeAll(infoC);
		Utils.Event.removeAll(ScrollUp);
		Utils.Event.removeAll(ScrollDown);
		info.classList.add('closed');
		infoC.classList.remove('scroll');
		ScrollUp.classList.remove('show');
		ScrollDown.classList.remove('show');
		Utils.Event.remove(window, 'resize', InfoResize);
	}else{
		infoC.scrollTop = 0;
		InfoResize();
		
		Utils.Event.add(infoC, 'mousewheel', OnWheel);
		Utils.Event.add(infoC, 'DOMMouseScroll', OnWheel); //Mozilla
		Utils.Event.add(ScrollUp, 'mousedown', function(){ScrollMediaImgsOn('up')});
		Utils.Event.add(ScrollUp, 'touchstart', function(){ScrollMediaImgsOn('up')});
		Utils.Event.add(ScrollUp, 'mouseup', ScrollMediaImgsOff);
		Utils.Event.add(ScrollUp, 'touchend', ScrollMediaImgsOff);
		Utils.Event.add(ScrollDown, 'mousedown', function(){ScrollMediaImgsOn('down')});
		Utils.Event.add(ScrollDown, 'touchstart', function(){ScrollMediaImgsOn('down')});
		Utils.Event.add(ScrollDown, 'mouseup', ScrollMediaImgsOff);
		Utils.Event.add(ScrollDown, 'touchend', ScrollMediaImgsOff);
		
		Utils.Event.add(window, 'resize', InfoResize);
		info.classList.remove('closed');
	}
	
	infoOpened = !infoOpened;
}

function InfoResize() {
	var maxH = Utils.getClientHeight() - 86 - infoFringe.offsetTop;
	infoCInitH = infoC.scrollHeight;
	if (infoCInitH < maxH){
		infoC.style.height = infoCInitH + 'px';
		infoC.classList.remove('scroll');
		ScrollUp.classList.remove('show');
		ScrollDown.classList.remove('show');
		return false;
	}else {
		maxH -= 33;
		infoC.style.height = maxH + 'px';
		infoC.classList.add('scroll');
		ScrollUp.classList.add('show');
		ScrollDown.classList.add('show');
		return true;
	}
}

function ChangePassOpen(){
	document.querySelector('#changepass_back').style.display = 'block';

	window.setTimeout(function(){
		document.querySelector('#changepass_back #changepassold').focus();
	}, 800);
	
	keyTarget.push({
		id: 'ChangePassOverlay',
		stopFurther: false,
		onEsc: ChangePassClose
	});
}
function ChangePassClose(){
	document.querySelector('#changepass_back').style.display = 'none';
	ChangePassReset();
	keyTarget.pop();
}
function ChangePassReset(){
	chpass.form.reset();
	chpass.mess.innerHTML = ''; chpass.mess.classList.remove('show'); chpass.mess.classList.remove('good');
}
function ChangePassAjax(form) {
	chpass.wait.style.display = 'block';
	$.ajax({
	  url: form.action,
	  cache: false,
	  type: 'POST',
	  data: $(form).serialize(),
	  success: function(json) {
		if (json.status && json.status=='ok') {
			ChangePassClose();
		}else {
			window.setTimeout(function(){
				document.querySelector('#changepass_back #changepassold').focus();
			}, 700);
			chpass.mess.innerHTML = ''+(json.status || json);
			chpass.mess.classList.add('show');
		}
		window.setTimeout(function(){chpass.wait.style.display = 'none';}, 500);
	  },
	  error: function(json) {
		chpass.mess.innerHTML = ''+json.statusText;
		chpass.mess.classList.add('show');
		window.setTimeout(function(){chpass.wait.style.display = 'none';}, 500);
	  }
	});
	return false;
}

function LoginOpen(){
	document.querySelector('#login_back').style.display = 'block';
	if (GlobalParams.ACCESS_LEVEL == 'FREE_REGISTRATION' && GlobalParams.registerUrl){

	}
	window.setTimeout(function(){
		document.querySelector('#login_back #login_user').focus();
	}, 800);
	
	keyTarget.push({
		id: 'loginOverlay',
		stopFurther: false,
		onEsc: LoginClose
	});
}
function LoginClose(){
	document.querySelector('#login_back').style.display = 'none';
	LoginReset();
	keyTarget.pop();
}
function LoginReset(){
	login.form.reset();
	reg.form.reset();
	login.mess.innerHTML = ''; login.mess.classList.remove('show'); login.mess.classList.remove('good');
	reg.mess.innerHTML = ''; reg.mess.classList.remove('show'); reg.mess.classList.remove('good');
	ResetLoginActive();
}
function LoginRememberCheck(box){
	box.classList.toggle('checked');
}

function LoginActivateSwap(anotherElem) {
	anotherElem = document.querySelector('#login_back #'+anotherElem);
	var active = document.querySelector('#login_back .fringe.active');
	var inactive;
	if(active === anotherElem){
		inactive = document.querySelector('#login_back #login_fringe');
	}else{
		inactive = anotherElem;
	}

	active.classList.remove('delay');
	inactive.classList.add('delay');
	
	active.classList.remove('active');
	inactive.classList.add('active');
}
function ResetLoginActive() {
	var active = document.querySelector('#login_back .fringe.active');
	if (active !== document.querySelector('#login_back #login_fringe')){
		LoginActivateSwap(active.id);
	}
}

function AuthAjax(form) {
	login.wait.style.display = 'block';
	var remember_check = form.querySelector('#remember_check');
	$.ajax({
	  url: form.action,
	  cache: false,
	  type: 'POST',
	  data: $(form).serialize()+'&'+remember_check.getAttribute('name')+'='+remember_check.classList.contains('checked'),
	  success: function(json) {
		if (json.success) {
			LoginClose();
			var links = '';
			if(json.roles){
				for(var r=0; r < json.roles.length; r++){
					if(json.roles[r].authority=='ROLE_ADMIN'){
						links = '<span onclick="window.open(\'admin\', \'_blank\')">' +
							Server.messages['index.admin.panel']
							+ '</span> | ';
						mediaContainerManager.setControl(1);
					}else if(json.roles[r].authority=='ROLE_OPERATOR'){
						mediaContainerManager.setControl(1);
					}
				}
			}
			links += '<span onclick="ChangePassOpen(); return false;">' +
							Server.messages['index.changepass']
							+ '</span> | ';
			document.querySelector('#user_panel').innerHTML =
				Server.messages['index.logged.as'] + ' ' + json.username +
				' | ' + links +
				'<span onclick="document.location=Server.paths.logout">' +
				Server.messages['index.logout'] + '</span>';
		}else {
			window.setTimeout(function(){
				document.querySelector('#login_back #login_user').focus();
			}, 700);
			login.mess.innerHTML = ''+(json.error || json);
			login.mess.classList.add('show');
		}
		window.setTimeout(function(){login.wait.style.display = 'none';}, 500);
	  },
	  error: function(json) {
		login.mess.innerHTML = ''+json.statusText;
		login.mess.classList.add('show');
		window.setTimeout(function(){login.wait.style.display = 'none';}, 500);
	  }
	});
	return false;
}
function RegAjax(form) {
	reg.wait.style.display = 'block';
	var formRequest = 'username='+encodeURIComponent(Form.Element.getValue(form['reg_email']))+'&'+$(form).serialize();
	$.ajax({
	  url: GlobalParams.registerUrl,
	  cache: false,
	  type: 'POST',
	  data: formRequest,
	  success: function(json) {
		if (json.success) {
			reg.form.querySelector('input[type="button"]').value =
				Server.messages['index.form.close'];
			reg.form.querySelector('input[type="button"]').classList.add('fin');
			reg.form.querySelector('input[type="submit"]').style.display = 'none';
			reg.mess.innerHTML = json.success;
			reg.mess.classList.add('show');
			reg.mess.classList.add('good');
		}else {
			var message = '';
			if(json[0] && json[0].error){
				if(json[0].error.errors){
					for(var m in json[0].error.errors){
						if (!json[0].error.errors.hasOwnProperty(m)) continue;
						message += json[0].error.errors[m].message+'<br/>';
					}
				}
			}else{
				message = ''+(json.error || json);
			}
			reg.mess.innerHTML = ''+message;
			reg.mess.classList.add('show');
		}
		window.setTimeout(function(){reg.wait.style.display = 'none';}, 500);
	  },
	  error: function(json) {
		reg.mess.innerHTML = ''+(json.responseText || json.statusText);
		reg.mess.classList.add('show');
		window.setTimeout(function(){reg.wait.style.display = 'none';}, 500);
	  }
	});
	return false;
}

function RecallAjax(form) {
	recall.wait.style.display = 'block';
	$.ajax({
	  url: Server.paths.forgotPass,
	  cache: false,
	  type: 'POST',
	  data: $(form).serialize(),
	  success: function(json) {
		if (json.success) {
			recall.form.querySelector('input[type="button"]').value =
				Server.messages['index.form.close'];
			recall.form.querySelector('input[type="button"]').classList.add('fin');
			recall.form.querySelector('input[type="submit"]').style.display = 'none';
			recall.mess.innerHTML = json.success;
			recall.mess.classList.add('show');
			recall.mess.classList.add('good');
		}else {
			var message = '';
			if(json[0] && json[0].error){
				if(json[0].error.errors){
					for(var m in json[0].error.errors){
						if (!json[0].error.errors.hasOwnProperty(m)) continue;
						message += json[0].error.errors[m].message+'<br/>';
					}
				}
			}else{
				message = ''+(json.error || json);
			}
			recall.mess.innerHTML = ''+message;
			recall.mess.classList.add('show');
		}
		window.setTimeout(function(){recall.wait.style.display = 'none';}, 500);
	  },
	  error: function(json) {
		recall.mess.innerHTML = ''+(json.responseText || json.statusText);
		recall.mess.classList.add('show');
		window.setTimeout(function(){recall.wait.style.display = 'none';}, 500);
	  }
	});
	return false;
}

var locale_curr = '', curr_fringe;
function SetLocale(evt, id) {
	document.location = document.location.protocol+'//'+document.location.host+document.location.pathname+'?lang='+id;
	locale_curr = id;
}
function LocaleHintTouch(event, inner, fringe){
	LocaleHintOn(event, inner);
	LocaleHintMove(this);
}
function LocaleHintOn(event, inner, fringe){
	object_hint.querySelector('#hint_text').innerHTML = inner;
	object_hint.classList.add('locale');
	if(fringe){document.querySelector(fringe).classList.add('back'); curr_fringe = fringe;}
}
function LocaleHintMove(ele){
	var pos = Utils.getOffset(ele);
	object_hint.style.top = pos.top + ele.offsetHeight/2 - 2 - object_hint.offsetHeight/2 + "px";
	object_hint.style.right = Utils.getClientWidth() - pos.left + 7 + "px";
}
function LocaleHintOff(){
	object_hint.classList.remove('locale');
	object_hint.style.top = "auto";
	object_hint.style.right = "auto";
	if(curr_fringe){document.querySelector(curr_fringe).classList.remove('back'); curr_fringe = null;}
}
function InitLocales() {
	flag_current.style.backgroundImage = 'url("images/front_map/'+Server.locale+'.png")';
	if(Browser.support.touch){
		Utils.Event.add(flag_current, 'touchstart', LocaleHintTouch.neoBind(flag_current, [Server.messages['index.lang.currentLang']+Server.locales_available[Server.locale].name, '#user_panel_fringe']));
		Utils.Event.add(flag_current, 'touchend', LocaleHintOff);
	}else{
		Utils.Event.add(flag_current, 'mousemove', function(){LocaleHintMove(this)});
		Utils.Event.add(flag_current, 'mouseover', LocaleHintOn.neoBind(this, [Server.messages['index.lang.currentLang']+Server.locales_available[Server.locale].name, '#user_panel_fringe']));
		Utils.Event.add(flag_current, 'mouseout', LocaleHintOff);
	}
	var flag;
	for (var l in Server.locales_available){
		if (!Server.locales_available.hasOwnProperty(l) || l==Server.locale) continue;
		
		flag = $('<div/>', {'class' : "flag"})[0];
		Utils.Event.add(flag, 'click', SetLocale.neoBind(window, [l]));
		if(Browser.support.touch){
			Utils.Event.add(flag, 'touchstart', LocaleHintTouch.neoBind(flag, [Server.locales_available[l].name, '#layers_fringe']));
			Utils.Event.add(flag, 'touchend', LocaleHintOff);
		}else{
			Utils.Event.add(flag, 'mousemove', function(){LocaleHintMove(this)});
			Utils.Event.add(flag, 'mouseover', LocaleHintOn.neoBind(this, [Server.locales_available[l].name, '#layers_fringe']));
			Utils.Event.add(flag, 'mouseout', LocaleHintOff);
		}
		flag.style.backgroundImage = 'url("images/front_map/'+l+'.png")';
		flags_available.appendChild(flag);
	}
}

var mask = [[1,1,1,1,1,1,1,1,1,1,1],[1,1,1,1,1,1]];
var maskLastChangedZoom;
function CheckMask(m1, m2){
	uplevel:
	for(var i=0; i<m1.length; i++){
		for(var j=0; j<m1[i].length; j++){
			 if ((m1[i][j] & m2[i][j]) > 0){continue uplevel;}
		}
		return false;
	}
	return true;
}
function FilterChange(element){
	var par = element.parentNode,
		mask_poss = element.id.substr(2).split('_').map(Number);
		
	element.classList.toggle('fon');
	mask[mask_poss[0]][mask_poss[1]] = Number(!mask[mask_poss[0]][mask_poss[1]]);
	poly_mgr.onMaskChanged(true);
	marker_mgr.updateObjects();
	SearchInVM.somethingChange(!SearchInVM.somethingChange());
}
function AOUps(element, up){
	if(Browser.name=='MSIE' && Browser.versionN < 9 || Browser.support.touch) return;

	var par = element.parentNode,
		mask_poss = element.id.substr(2).split('_').map(Number),
		emptymask = [[0,0,0,0,0,0,0,0,0,0,0],[1,1,1,1,1,1]];
		
	emptymask[mask_poss[0]][mask_poss[1]] = Number(!emptymask[mask_poss[0]][mask_poss[1]]);
	var byMask = poly_mgr.getObjectsByMask(emptymask);
	for(var i=0; i<byMask.visible.length; i++){
		byMask.visible[i].doShadow = up;
		byMask.visible[i].draw();
	}
}

function LoadCams(){
	return $.ajax({
	  url: Server.paths.getAll,
	  cache: false,
	  success: function(json) {
		json.forEach(function(element, index, array){
			element.mask = element.mask.split('').map(Number);
			element.mask.splice(0, 0, element.mask.splice(0,11), element.mask.splice(0,mask[1].length));
			
			element.icon = 'images/front_map/icon_cam.png';
			if(element.mask[1][0]==1) element.icon = 'images/front_map/icon_cam_blue.png';
			else if(element.mask[1][1]==1) element.icon = 'images/front_map/icon_cam_yellow.png';
			else if(element.mask[1][2]==1) element.icon = 'images/front_map/icon_cam_green.png';
			else if(element.mask[1][4]==1) element.icon = 'images/front_map/icon_cam_purple.png';
			cams[element.id] = element;
		});
		for (var c in cams){
			if (!cams.hasOwnProperty(c)) continue;
			if (cams[c].relations)
			for (var r in cams[c].relations){
				if (!cams[c].relations.hasOwnProperty(r)) continue;
				if (cams.hasOwnProperty(r))	cams[c].relations[r] = cams[r];
				else delete	cams[c].relations[r];
			}
		}
	  },
	  error: function(json) {
		console.error('Ошибка загрузки камер: ' + json.status + ' ('+json.statusText+')');
	  }
	});
}

function DrawCams(){
	var icon, neomarker,
		iblack = 'images/front_map/camera_black_new.png',
		iblue = 'images/front_map/camera_blue_new.png',
		iyellow = 'images/front_map/camera_yellow_new.png',
		igreen = 'images/front_map/camera_green_new.png',
		ipurple = 'images/front_map/camera_purple_new.png';
	
	var markersLayerRaphael;// = Raphael(map._panes.markerPane, GlobalParams.Width, GlobalParams.Height);
	
	for (var c in cams){
		if (!cams.hasOwnProperty(c)) continue;
		icon = iblack;
		if(cams[c].mask[1][0]==1) icon = iblue;
		else if(cams[c].mask[1][1]==1) icon = iyellow;
		else if(cams[c].mask[1][2]==1) icon = igreen;
		else if(cams[c].mask[1][4]==1) icon = ipurple;
		
		neomarker = new L.NeoMarker((cams[c].lat && cams[c].lng ? new L.LatLng(cams[c].lat, cams[c].lng) : mapDefCenter), {id: c, img: icon});
		marker_mgr.addMarker(neomarker);
	}
	marker_mgr.refresh();
}

function LoadAOs(){
	return Utils.addScript('js/NeoPolygonsAO.js'+'?cctv='+GlobalParams.appVersion);
}


ko.bindingHandlers.ScrollTop = {
    init: function(element, valueAccessor, allBindingsAccessor, viewModel) {
		/*Вызывается каждый раз вместе с перерендеринком template*/
		
		var valueUnwrapped = ko.utils.unwrapObservable(valueAccessor());
		window.setTimeout(function(){element.scrollTop = valueUnwrapped;}, 50);
    },
    update: function(element, valueAccessor, allBindingsAccessor, viewModel) {
		var valueUnwrapped = ko.utils.unwrapObservable(valueAccessor());
		element.scrollTop = valueUnwrapped;
    }
};

function CamListVM(cams, maxH) {
	this.cams = ko.observableArray([]);
	this.DOMtempl = null;
	this.DOMRowsWrapper = null;
	this.containerH = ko.observable(0); this.containerHOld = 0; this.containerH.subscribe(this.containerHChange.neoBind(this));
	this.maxH = ko.observable(maxH || 0);
	this.scrollActive = ko.observable(false); this.scrollActive.subscribe(this.scrollActiveChange.neoBind(this));
	this.scrollTop = ko.observable(0);
	this.scrollDownNoScroll = ko.observable(false);
	
	if (cams){
		if (Utils.isObjectType('Array', cams)) this.replaceCamsByCamsArr(cams);
		else this.updateCamsByCamsHash(cams);
	}
}
CamListVM.prototype.updateCamsByCamsHash = function(camHash) {
	var arr = [];
	for (var c in camHash){
		if (!camHash.hasOwnProperty(c)) continue;
		arr.push(camHash[c]);
	}
	this.replaceCamsByCamsArr(arr);
};
CamListVM.prototype.replaceCamsByCamsArr = function(camArr) {
	this.cams(camArr);
};
CamListVM.prototype.addCam = function(cam){
	this.cams.push(cam);
};
CamListVM.prototype.checkForScroll = function(){
	var maxH, contentH;
	if (this.DOMtempl){
		maxH = this.maxH();
		contentH = this.DOMtempl.querySelector('.camListRows').offsetHeight;
		if (contentH <= maxH){
			this.scrollActive(false);
		} else {
			contentH = maxH;
			this.scrollActive(true);
		}
		this.containerH(contentH);
	}
};
CamListVM.prototype.containerHChange = function (newVal){
	if(this.scrollActive() && this.containerHOld!=0){
		var delta = newVal-this.containerHOld;
		//Если высота контейнер увеличивается, "вытягиваем" скроллер сверху. Если уменьшается, то будет "поджиматься" снизу.
		if (delta>0) this.ScrollRecalc(newVal-this.containerHOld);
	}
	this.containerHOld = newVal;
}
CamListVM.prototype.clickRow = function (cam, evt){
	marker_mgr.objects[cam.id].MarkerClick(evt);
};
CamListVM.prototype.scrollActiveChange = function (newVal){
	this.ScrollRecalc(Math.abs(this.scrollTop()));
};
CamListVM.prototype.Scroll = function (dir, step, wheel){
	var scrollTop = this.scrollTop(),
		hDelta = this.DOMRowsWrapper.offsetHeight - this.DOMRows.offsetHeight;

	if (dir=='down' && scrollTop > hDelta){
		scrollTop -= step;
		if (scrollTop < hDelta) scrollTop = hDelta;
	}else if (dir=='up' && scrollTop<0){
		scrollTop += step;
		if (scrollTop > 0) scrollTop = 0;
	}else if (!wheel) {ScrollMediaImgsOff(); return;}
	this.scrollTop(scrollTop);
	
	this.scrollDownNoScroll(scrollTop <= hDelta);
};
CamListVM.prototype.ScrollRecalc = function (delta){
	if (delta!=0) this.Scroll((delta > 0 ? 'up' : 'down'), Math.abs(delta));
};
CamListVM.prototype.ScrollOn = function (dir){
	this.ScrollinfoInterval = window.setInterval(function(){this.Scroll(dir, 10);}.neoBind(this),60);
};
CamListVM.prototype.ScrollOnUp = function (){
	this.ScrollOn('up');
};
CamListVM.prototype.ScrollOnDown = function (){
	this.ScrollOn('down');
};
CamListVM.prototype.ScrollOff = function (){
	if (this.ScrollinfoInterval) clearInterval(this.ScrollinfoInterval);
	this.ScrollinfoInterval = null;
};
CamListVM.prototype.OnWheel = function (viewModel, e){
	var dir;
	e = e.originalEvent || e;
	if (e.type=='DOMMouseScroll') dir = -1*e.detail;
	else dir = e.wheelDelta;
	if (dir>0) dir = 'up';
	else dir = 'down';
	this.Scroll(dir, 12, true);
	return false;
};
CamListVM.prototype.AfterTemplateRender = function(elements, data) {
	data.DOMtempl = elements[0];
	data.DOMRowsWrapper = elements[0].querySelector('.camListRowsWrapper');
	data.DOMRows = data.DOMRowsWrapper.querySelector('.camListRows');
};


function srchOpen(){
	if(SearchInVM.open()) return;
	SearchInVM.open(true);
}
function srchClose(){
	if(!SearchInVM.open()) return;
	SearchInVM.open(false);
}
function srchToggle(){
	if(SearchInVM.open()) srchClose();
	else srchOpen();
}
function srchFocus(){
	keyTarget.push({
		id: 'SearchInputOverlay',
		stopFurther: false,
		onEsc: srchBlur
	});
	srchOpen();
}
function srchBlur(){
	keyTarget.pop();
	search.SearchInput.blur();
}
function srchClear(){
	SearchInVM.query('');
}

var SearchInVM = {
	// Data
	open: ko.observable(false),
	query: ko.observable(''),
	respectFilter: ko.observable(true),
	applyMap: ko.observable(false),
	resultCount: ko.observable(0),
	
	somethingChange: ko.observable(true),
	
	CamList: null,
	
	// Behaviors
	toggleOpen: function(){
		var newBool = !this.open();
		this.open(newBool);
	},
	toggleFilter: function(){
		this.respectFilter (!this.respectFilter());
		if (this.applyMap() && !this.respectFilter()) this.toggleApplyMap();
	},
	toggleApplyMap: function(){
		var newBool = !this.applyMap();
		this.applyMap(newBool);
		if (newBool && !this.respectFilter()) this.respectFilter(true);
		
		if (!newBool)  marker_mgr.updateObjects();
	},
	clear: function(){this.query('')},
	setSize: function(){
		var search_out = document.querySelector('#search_panel #search_out');
		var possibleH = Utils.getDocumentHeight() - Utils.getOffset(search_out).top - 5;
		this.CamList.maxH(possibleH);
		this.CamList.checkForScroll();
	}
};


function MakeKnokout(){
	SearchInVM.CamList = new CamListVM();
	
	/**
	 * Через 100мс после открытия поиска пересчитываем размер search_out
	 */
	function SearchSizeChange(){SearchInVM.setSize();}
	SearchInVM.openThrottle = ko.computed({
		read: function() {
			if(this.open()){
				this.setSize();
				Utils.Event.add(window, 'resize', SearchSizeChange);
			}else{
				Utils.Event.remove(window, 'resize', SearchSizeChange);
			}
		},
		write: function (value) {
        },
		owner: SearchInVM
	}).extend({ throttle: 100 });
	
	SearchInVM.FindedCams = ko.computed({
		read: function() {
			var search = this.query().toLowerCase();
			var filter = this.respectFilter();
			this.somethingChange(); //Флаг во ViewModel, изменив который во вне, можно заново вызвать этот метот фильтрации

			var resultHash = {};

			if (search.length>0){
				for (var c in cams){
					if (!cams.hasOwnProperty(c)) continue;
					if (cams[c].address.toLowerCase().indexOf(search) >= 0 || cams[c].name.toLowerCase().indexOf(search) >= 0){
						if(filter && !CheckMask(cams[c].mask, mask)) continue;
						resultHash[c] = cams[c];
					}
				}
			}
			if (this.applyMap()) marker_mgr.updateObjects((search.length>0 ? resultHash : null));
			this.CamList.updateCamsByCamsHash(resultHash);
			this.resultCount(Utils.getObjectPropertyLength(resultHash));
			this.CamList.checkForScroll();
			return resultHash;
		},
		write: function (value) {
        },
		owner: SearchInVM
	}).extend({ throttle: 100 });

	ko.applyBindings(GlobalParamsVM, document.getElementById('user_panel_fringe'));
	ko.applyBindings(GlobalParamsVM, document.getElementById('super_home_fringe'));
	ko.applyBindings(SearchInVM, document.getElementById('search_panel'));
	
	MakeMatrixVM();
	ko.applyBindings(MatrixVM, document.getElementById('matrix_button_fringe'));	
}

function mousePageXY(e){
	var x = 0, y = 0;	
	if (!e) e = window.event;
	if (e.touches && e.touches.item && e.touches.item(0)){
		var et = e.touches.item(0);
		if (et.pageX || et.pageY){
			x = et.pageX;
			y = et.pageY;
		}else if (et.clientX || et.clientY){
			x = et.clientX + (document.documentElement.scrollLeft || document.body.scrollLeft) - document.documentElement.clientLeft;
			y = et.clientY + (document.documentElement.scrollTop || document.body.scrollTop) - document.documentElement.clientTop;
		}
	}else if (e.pageX || e.pageY){
		x = e.pageX;
		y = e.pageY;
	}else if (e.clientX || e.clientY){
		x = e.clientX + (document.documentElement.scrollLeft || document.body.scrollLeft) - document.documentElement.clientLeft;
		y = e.clientY + (document.documentElement.scrollTop || document.body.scrollTop) - document.documentElement.clientTop;
	}	
	return {"x":x, "y":y};
}

var nextSessionTimeout, sessionUpdateDefaultInterval = 55000;
function SessionUpdater(when){
	window.clearTimeout(nextSessionTimeout);
	nextSessionTimeout = window.setTimeout(SessionUpdate, when || sessionUpdateDefaultInterval);
}
function SessionUpdate(){
	$.ajax({
	  url: Server.paths.iAmHere,
	  cache: false,
	  success: function(json) {},
	  error: function(json) {
		console.error('Ошибка возобновления сессии: ' + response.statusText);
	  }
	});
	SessionUpdater();
}

function navigationSlider(slider){
	this.DOMPanel = slider;
	this.DOMSlider = document.createElement('div'); this.DOMSlider.id = 'nav_slider';
	this.DOMPanel.appendChild(this.DOMSlider);
	
	this.DomDashsArray = [];
	
	map.on('zoomend', this.onChangeZoom, this);
	
	this.DOMh = 9;
	this.offset = 0;
	this.usefulH = 171;
	this.sliderOnZoom = 0;
	
	this.SnatchBind = this.Snatch.neoBind(this);
	this.SnatchOffBind = this.SnatchOff.neoBind(this);
	this.SnatchOffByWindowOutBind = this.SnatchOffByWindowOut.neoBind(this);
	this.dashOverBind = this.dashOver.neoBind(this);
	this.dashClickBind = this.dashClick.neoBind(this);
	
	this.zoomChangeTimeout = null;
	
	Utils.Event.add(this.DOMPanel, ET.mdown, this.SnatchBind, false);
	
	//if(Browser.support.touch) Utils.Event.add(this.DOMPanel, 'touchstart', this.SnatchBind, false);
	
	this.recalcZooms();
}
navigationSlider.prototype.recalcZooms = function(){
	this.numZooms = map.getMaxZoom() - map.getMinZoom() + 1;
	this.step = this.usefulH/this.numZooms;

	for(var z=this.numZooms-1; z>=0; z--){
		this.DomDashsArray[z] = document.createElement('div');
		this.DomDashsArray[z].id = 'd'+z;
		this.DomDashsArray[z].style.height = this.step+'px';
		this.DomDashsArray[z].classList.add('dash');
		this.DOMPanel.insertBefore(this.DomDashsArray[z], this.DOMSlider);
		Utils.Event.add(this.DomDashsArray[z], 'click', this.dashClick.neoBind(this, [z]), true);
	}
	
	this.sliderOnZoom = map.getZoom();
	this.pos();
};
navigationSlider.prototype.dashClick = function(event, zoom){
	map.setZoom(zoom);
};
navigationSlider.prototype.dashOver = function(obj){
	var newZoom = Number(obj.target.id.substr(1));
	this.sliderOnZoom = newZoom;
	window.clearTimeout(this.zoomChangeTimeout);
	this.zoomChangeTimeout = window.setTimeout(function(){
		map.setZoom(newZoom);
	}, 500);
	this.pos();
};
navigationSlider.prototype.onChangeZoom = function(obj){
	this.sliderOnZoom = map.getZoom();
	this.pos();
};
navigationSlider.prototype.pos = function(){
	this.DOMSlider.style.bottom = this.step*this.sliderOnZoom-this.offset + 'px';
};
navigationSlider.prototype.Snatch = function(evt){
	for(var z=0; z<this.numZooms; z++){
		Utils.Event.add(this.DomDashsArray[z], 'mouseover', this.dashOverBind, false);
		/*if(Browser.support.touch){
			Utils.Event.add(this.DomDashsArray[z], 'touchmove', function(){alert(9)}, false);
		}*/
	}
	Utils.Event.add(document.body, ET.mup, this.SnatchOffBind, false);
	Utils.Event.add(document.body, 'mouseout', this.SnatchOffByWindowOutBind, false);
	
	
	/*if(Browser.support.touch){
		Utils.Event.add(this.DOMPanel, 'touchmove', this.SnatchTouchMoveBind, false);
		Utils.Event.add(document.body, 'touchend', this.SnatchOffBind, false);
	}*/
	
};
navigationSlider.prototype.SnatchOff = function(evt){
	Utils.Event.remove(document.body, ET.mdup, this.SnatchOffBind, false);
	Utils.Event.remove(document.body, 'mouseout', this.SnatchOffByWindowOutBind, false);
	for(var z=0; z<this.numZooms; z++){
		Utils.Event.remove(this.DomDashsArray[z], 'mouseover', this.dashOverBind, false);
	}
	/*if(Browser.support.touch){
		Utils.Event.remove(this.DOMPanel, 'touchmove', this.SnatchTouchMoveBind, false);
		Utils.Event.remove(document.body, 'touchend', this.SnatchOffBind, false);
	}*/
}
navigationSlider.prototype.SnatchOffByWindowOut = function(evt){
	var pos = mousePageXY(evt);
	if(pos.x<=0 || pos.x>=Utils.getDocumentWidth() ||
	   pos.y<=0 || pos.y>=Utils.getDocumentHeight()){
	   this.SnatchOff(evt);
	}
}