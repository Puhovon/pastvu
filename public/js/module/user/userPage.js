/*global define:true*/
/**
 * Модель содержимого страницы пользователя
 */
define(['underscore', 'Utils', 'Params', 'renderer', 'knockout', 'knockout.mapping', 'm/_moduleCliche', 'globalVM', 'm/storage', 'm/User', 'text!tpl/user/userPage.jade', 'css!style/user/userPage'], function (_, Utils, P, renderer, ko, ko_mapping, Cliche, globalVM, storage, User, jade) {
	'use strict';

	return Cliche.extend({
		jade: jade,
		create: function () {
			this.auth = globalVM.repository['m/common/auth'];
			this.briefVM = null;
			this.contentVM = null;

			this.user = null;
			this.section = null;
			this.menuItems = null;

			// Subscriptions
			this.subscriptions.route = globalVM.router.routeChanged.subscribe(this.routeHandler, this);
			this.routeHandler();
		},
		show: function () {
			if (!this.showing) {
				this.makeVM();
				globalVM.func.showContainer(this.$container);
				this.showing = true;
			}
		},
		hide: function () {
			globalVM.func.hideContainer(this.$container);
			this.showing = false;
		},
		makeVM: function () {
			this.section = ko.observable('');
			this.menuItems = ko.computed(function () {
				var login = this.user.login(),
					result = [
						{name: 'Profile', href: "/u/" + login, section: 'profile'},
						{name: 'Photos', href: "/u/" + login + "/photo", section: 'photo'},
						{name: 'Comments', href: "/u/" + login + "/comments", section: 'comments'}
					];

				if (this.auth.loggedIn() && (this.auth.iAm.login() === login)) {
					result.push({name: 'Settings', href: "/u/" + login + "/settings", section: 'settings'});
					result.push({name: 'Messages', href: "/u/" + login + '/pm', disable: true, section: 'pm'});
				}
				return result;
			}, this);

			ko.applyBindings(globalVM, this.$dom[0]);
		},
		routeHandler: function () {
			var params = globalVM.router.params(),
				user = params.user || this.auth.iAm.login();

			if (params.photoUpload && !this.auth.loggedIn()) {
				this.auth.show('login', function (result) {
					if (result.loggedIn) {
						this.routeHandler();
					} else {
						globalVM.router.navigateToUrl('/');
					}
				}, this);
				return;
			}

			if (this.user && this.user.login() === user) {
				this.updateSectionDepends(params.section, params.photoUpload);
			} else {
				storage.user(user, function (data) {
					if (data) {
						this.user = User.vm(data.origin, this.user);
						this.show();
						this.updateUserDepends();
						this.updateSectionDepends(params.section, params.photoUpload);
					}
				}, this);
			}

		},

		updateUserDepends: function () {
			if (this.briefVM) {
				this.briefVM.setUser(this.user.login());
			} else {
				renderer(
					[
						{
							module: 'm/user/brief', container: '#user_brief', options: {affix: true, user: this.user.login()},
							callback: function (vm) {
								this.briefVM = vm;
								this.childModules[vm.id] = vm;
							}.bind(this)
						}
					],
					{
						parent: this,
						level: this.level + 1
					}
				);
			}
		},
		updateSectionDepends: function (section, upload) {
			var module,
				moduleOptions = {container: '#user_content'};

			if (section === 'profile') {
				module = 'm/user/profile';
				Utils.title.setTitle({title: this.user.fullName()});
			} else if (section === 'photos' || section === 'photo') {
				module = 'm/user/gallery';
				moduleOptions.options = {canAdd: true};
				if (upload) {
					if (this.contentVM && this.contentVM.module === module) {
						this.contentVM.showUpload();
					} else {
						moduleOptions.options.goUpload = true;
					}
				}
				Utils.title.setTitle({pre: 'Галерея - ', title: this.user.fullName()});
			} else if (section === 'comments') {
				module = 'm/user/comments';
				Utils.title.setTitle({pre: 'Комментарии - ', title: this.user.fullName()});
			} else if (section === 'settings') {
				module = 'm/user/settings';
				Utils.title.setTitle({pre: 'Настройки - ', title: this.user.fullName()});
			}

			this.section(section);

			if (!this.contentVM || this.contentVM.module !== module) {
				moduleOptions.module = module;
				renderer(
					[
						_.assign(moduleOptions, {
							callback: function (vm) {
								this.contentVM = vm;
								this.childModules[vm.id] = vm;
							}.bind(this)
						})
					],
					{
						parent: this,
						level: this.level + 2 //Чтобы не удалились модули brief и menu на уровне this.level + 1
					}
				);
			}
		}
	});
});