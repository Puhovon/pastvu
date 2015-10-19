import ms from 'ms';
import _ from 'lodash';
import log4js from 'log4js';
import Utils from '../commons/Utils';
import constants from './constants.js';
import * as session from './_session';
import * as subscrController from './subscr';
import * as regionController from './region.js';
import * as actionLogController from './actionlog.js';
import * as userObjectRelController from './userobjectrel';
import { giveReasonTitle } from './reason';

const photoController = require('./photo');

import { News } from '../models/News';
import { User } from '../models/User';
import { Photo } from '../models/Photo';
import { Counter } from '../models/Counter';
import { Comment, CommentN } from '../models/Comment';

const dayMS = ms('1d');
const commentMaxLength = 12e3;
const logger = log4js.getLogger('comment.js');
const maxRegionLevel = constants.region.maxLevel;
const commentsUserPerPage = 15;

const msg = {
    deny: 'У вас нет разрешения на это действие', // 'You do not have permission for this action'
    noUser: 'Запрашиваемый пользователь не существует',
    noObject: 'Комментируемого объекта не существует, или модераторы перевели его в недоступный вам режим',
    noComments: 'Операции с комментариями на этой странице запрещены',
    noCommentExists: 'Комментария не существует',
    badParams: 'Неверные параметры запроса',
    maxLength: 'Комментарий длиннее допустимого значения (' + commentMaxLength + ')'
};

const permissions = {
    canModerate(type, obj, usObj) {
        return usObj.registered &&
            (type === 'photo' && photoController.permissions.canModerate(obj, usObj)
            || type === 'news' && usObj.isAdmin)
            || undefined;
    },
    canEdit(comment, obj, usObj) {
        return usObj.registered && !obj.nocomments &&
            comment.user.equals(usObj.user._id) && comment.stamp > (Date.now() - dayMS);
    },
    canReply(type, obj, usObj) {
        return usObj.registered && !obj.nocomments &&
            (type === 'photo' && obj.s >= constants.photo.status.PUBLIC || type === 'news');
    }
};

function commentsTreeBuildAnonym(comments, usersHash) {
    const hash = {};
    const tree = [];

    for (const comment of comments) {
        const user = usersHash[String(comment.user)];

        if (!user) {
            logger.error(
                `User for comment undefined. Comment userId: ${String(comment.user)}`,
                `Comment: ${JSON.stringify(comment)}`
            );
            throw { message: 'Unknow user in comments' };
        }

        comment.user = user.login;

        comment.stamp = comment.stamp.getTime(); // Serve time in ms

        if (comment.lastChanged !== undefined) {
            comment.lastChanged = comment.lastChanged.getTime();
        }

        if (comment.level === undefined) {
            comment.level = 0;
        }

        if (comment.level > 0) {
            const commentParent = hash[comment.parent];
            if (commentParent.comments === undefined) {
                commentParent.comments = [];
            }
            commentParent.comments.push(comment);
        } else {
            tree.push(comment);
        }

        hash[comment.cid] = comment;
    }

    return tree;
};

async function commentsTreeBuildAuth(myId, comments, previousViewStamp, canReply) {
    const dayAgo = Date.now() - dayMS;
    const commentsArr = [];
    const commentsHash = {};
    const usersHash = {};
    const usersArr = [];

    let countTotal = 0;
    let countNew = 0;

    for (const comment of comments) {
        comment.user = String(comment.user);

        if (usersHash[comment.user] === undefined) {
            usersHash[comment.user] = true;
            usersArr.push(comment.user);
        }

        comment.stamp = comment.stamp.getTime(); // Serve time in ms

        const commentIsMine = comment.user === myId; // It's my comment
        const commentIsDeleted = comment.del !== undefined; // Comment was deleted

        if (commentIsDeleted) {
            comment.delRoot = comment; // At the beginning removed comment considered as a removed root
        }

        if (comment.level === undefined) {
            comment.level = 0;
        }
        if (comment.level > 0) {
            const commentParent = commentsHash[comment.parent];

            // To figure out, is there a current user comment inside removed branch (so he may see this thread),
            // in every child we need to save link to root removed element, while will not current user's comment
            // and in this case mark root removed as saved and drop it children

            if (commentParent === undefined) {
                // If parent doesn't exists in hash, possibly because its in saved branch of removed comments already,
                // but is not root, and therefore already dropped, so we need drop current as well
                continue;
            }

            if (commentIsDeleted) {
                if (commentParent.del !== undefined) {
                    if (commentParent.delRoot.delSave === true) {
                        continue; // If root removed parent has already saved, drop current
                    }
                    comment.delRoot = commentParent.delRoot; // Save link to parent's root
                    if (commentIsMine) {
                        // If it's own current, indicate that root must be saved and drop current
                        comment.delRoot.delSave = true;
                        continue;
                    }
                } else if (commentIsMine) {
                    // If it's own root removed comment (no removed parents), save it immediately
                    comment.delRoot.delSave = true;
                }
            }
            if (commentParent.comments === undefined) {
                if (canReply && commentParent.del === undefined &&
                    !commentIsDeleted && commentParent.can.del === true) {
                    // If under not removed parent comment we find first child not removed comment,
                    // and user can remove parent (i.e it's his own comment), cancel remove ability,
                    // because user can't remove his own comments with replies
                    delete commentParent.can.del;
                }
                commentParent.comments = [];
            }
        } else if (commentIsDeleted && commentIsMine) {
            // If it's own removed first level comment, immediately save it
            comment.delSave = true;
        }

        if (!commentIsDeleted) {
            countTotal++;
            if (canReply) {
                comment.can = {};
                if (commentIsMine && comment.stamp > dayAgo) {
                    // User can remove its own comment (without replies) or edit its own during twenty-four hours
                    comment.can.edit = comment.can.del = true;
                }
            }
            if (previousViewStamp && !commentIsMine && comment.stamp > previousViewStamp) {
                comment.isnew = true;
                countNew++;
            }
        }
        commentsHash[comment.cid] = comment;
        commentsArr.push(comment);
    }

    const { usersById, usersByLogin } = await getUsersHashForComments(usersArr);

    const commentsTree = [];

    // Grow comments tree
    for (const comment of commentsArr) {
        if (comment.del !== undefined) {
            if (comment.delRoot.delSave === true) {
                // Just pass a flag, that comment is removed. Details can be found in the history of changes
                comment.del = true;
                delete comment.txt; // Removed root comment (closed) pass without a text
                delete comment.frag;
                delete comment.delRoot;
                delete comment.delSave; // Remove delSave, and then its children will not be included in this branch
                delete comment.comments;
            } else {
                continue;
            }
        }

        comment.user = usersById[comment.user].login;
        if (comment.lastChanged !== undefined) {
            comment.lastChanged = comment.lastChanged.getTime();
        }

        if (comment.level > 0) {
            commentsHash[comment.parent].comments.push(comment);
        } else {
            commentsTree.push(comment);
        }
    }

    return { tree: commentsTree, users: usersByLogin, countTotal, countNew };
};

async function commentsTreeBuildCanModerate(myId, comments, previousViewStamp) {
    const commentsHash = {};
    const commentsPlain = [];
    const commentsTree = [];
    const usersHash = {};
    const usersArr = [];

    let countTotal = 0;
    let countNew = 0;

    for (const comment of comments) {
        if (comment.level === undefined) {
            comment.level = 0;
        }
        if (comment.level > 0) {
            const commentParent = commentsHash[comment.parent];
            if (commentParent === undefined || commentParent.del !== undefined) {
                // If parent removed or doesn't exists (eg parent of parent is removed), drop comment
                continue;
            }
            if (commentParent.comments === undefined) {
                commentParent.comments = [];
            }
            commentParent.comments.push(comment);
        } else {
            commentsTree.push(comment);
        }

        commentsHash[comment.cid] = comment;
        commentsPlain.push(comment);

        comment.user = String(comment.user);
        if (usersHash[comment.user] === undefined) {
            usersHash[comment.user] = true;
            usersArr.push(comment.user);
        }

        comment.stamp = comment.stamp.getTime(); // Serve time in ms
        if (comment.lastChanged !== undefined) {
            comment.lastChanged = comment.lastChanged.getTime();
        }

        if (comment.del !== undefined) {
            // Just pass a flag, that comment is removed. Details can be found in the history of changes
            comment.del = true;
            delete comment.txt; // Removed root comment (closed) pass without a text
            delete comment.frag;
            delete comment.comments;
            continue;
        } else if (previousViewStamp && comment.stamp > previousViewStamp && comment.user !== myId) {
            comment.isnew = true;
            countNew++;
        }

        countTotal++;
    }

    const { usersById, usersByLogin } = await getUsersHashForComments(usersArr);

    for (const comment of commentsPlain) {
        comment.user = usersById[comment.user].login;
    }

    return { tree: commentsTree, users: usersByLogin, countTotal, countNew };
};

async function commentsTreeBuildDel(comment, childs, checkMyId) {
    const commentsHash = {};
    const usersHash = {};
    const usersArr = [];

    // Determine if user is able to see comment branch.
    // If checkMyId is not passed - can,
    // if passed, we will determine if user is author of one of removed comment in the requested branch
    let canSee = checkMyId ? false : true;

    // Firstly process removed parent, which was requested
    comment.user = String(comment.user);
    usersHash[comment.user] = true;
    usersArr.push(comment.user);
    commentsHash[comment.cid] = comment;

    comment.del = { origin: comment.del.origin || undefined };
    comment.stamp = comment.stamp.getTime();
    comment.lastChanged = comment.lastChanged.getTime();

    if (comment.level === undefined) {
        comment.level = 0;
    }

    // If ordinary user is author of removed parent, then immediatly decide that we can see branch
    if (checkMyId && comment.user === checkMyId) {
        canSee = true;
    }

    // Loop by children of removed parent
    for (const child of childs) {
        const commentParent = commentsHash[child.parent];

        // If current comment not in hash, means hi is not child of removed parent
        if (commentParent === undefined) {
            continue;
        }

        child.user = String(child.user);
        if (usersHash[child.user] === undefined) {
            usersHash[child.user] = true;
            usersArr.push(child.user);
        }
        if (checkMyId && child.user === checkMyId) {
            canSee = true;
        }
        child.del = { origin: child.del.origin || undefined };
        child.stamp = child.stamp.getTime();
        child.lastChanged = child.lastChanged.getTime();

        if (commentParent.comments === undefined) {
            commentParent.comments = [];
        }
        commentParent.comments.push(child);
        commentsHash[child.cid] = child;
    }

    // If user who request is not moderator, and not whose comments are inside branch,
    // means that he can't see branch, return 'not exists'
    if (!canSee) {
        throw { message: msg.noCommentExists };
    }

    const { usersById, usersByLogin } = await getUsersHashForComments(usersArr);

    _.forOwn(commentsHash, comment => {
        comment.user = usersById[comment.user].login;
    });

    return { tree: [comment], users: usersByLogin };
};

// Prepare users hash for comments
async function getUsersHashForComments(usersArr) {
    const users = await User.find(
        { _id: { $in: usersArr } }, { _id: 1, login: 1, avatar: 1, disp: 1, ranks: 1 }, { lean: true }
    ).exec();

    const usersById = {};
    const usersByLogin = {};

    for (const user of users) {
        if (user.avatar) {
            user.avatar = '/_a/h/' + user.avatar;
        }

        // For speed check directly in hash, without 'isOnline' function
        user.online = session.usLogin[user.login] !== undefined;
        usersByLogin[user.login] = usersById[String(user._id)] = user;
        delete user._id;
    }

    return { usersById, usersByLogin };
}

export const core = {
    // Simplified comments distribution for anonymous users
    async getCommentsObjAnonym(iAm, data) {
        let obj;
        let commentModel;

        if (data.type === 'news') {
            commentModel = CommentN;
            obj = await News.findOne({ cid: data.cid }, { _id: 1 }).exec();
        } else {
            commentModel = Comment;
            obj = await photoController.findPhoto(iAm, { cid: data.cid });
        }

        if (!obj) {
            throw { message: msg.noObject };
        }

        const comments = await commentModel.find(
            { obj: obj._id, del: null },
            { _id: 0, obj: 0, hist: 0, del: 0, geo: 0, r0: 0, r1: 0, r2: 0, r3: 0, r4: 0, r5: 0, __v: 0 },
            { lean: true, sort: { stamp: 1 } }
        ).exec();

        const usersArr = [];

        if (comments.length) {
            const usersHash = {};

            for (const comment of comments) {
                const userId = String(comment.user);

                if (usersHash[userId] === undefined) {
                    usersHash[userId] = true;
                    usersArr.push(userId);
                }
            }
        }

        let tree;
        let usersById;
        let usersByLogin;

        if (usersArr.length) {
            ({ usersById, usersByLogin } = await getUsersHashForComments(usersArr));
            tree = commentsTreeBuildAnonym(comments, usersById);
        }

        return { comments: tree || [], countTotal: comments.length, users: usersByLogin };
    },
    async getCommentsObjAuth(iAm, { cid, type = 'photo' }) {
        let obj;
        let commentModel;

        if (type === 'news') {
            commentModel = CommentN;
            obj = await News.findOne({ cid }, { _id: 1, nocomments: 1 }).exec();
        } else {
            commentModel = Comment;
            obj = await photoController.findPhoto(iAm, { cid });
        }

        if (!obj) {
            throw { message: msg.noObject };
        }

        const [comments, relBeforeUpdate] = await* [
            // Take all object comments
            commentModel.find(
                { obj: obj._id },
                { _id: 0, obj: 0, hist: 0, 'del.reason': 0, geo: 0, r0: 0, r1: 0, r2: 0, r3: 0, r4: 0, r5: 0, __v: 0 },
                { lean: true, sort: { stamp: 1 } }
            ).exec(),
            // Get last user's view time of comments and object and replace it with current time
            // with notification reset if it scheduled
            userObjectRelController.setCommentView(obj._id, iAm.user._id, type)
        ];

        let previousViewStamp;

        if (relBeforeUpdate) {
            if (relBeforeUpdate.comments) {
                previousViewStamp = relBeforeUpdate.comments.getTime();
            }
            if (relBeforeUpdate.sbscr_noty) {
                // Если было заготовлено уведомление,
                // просим менеджер подписок проверить есть ли уведомления по другим объектам
                subscrController.commentViewed(obj._id, iAm.user);
            }
        }

        const canModerate = permissions.canModerate(type, obj, iAm);
        const canReply = canModerate || permissions.canReply(type, obj, iAm);

        if (!comments.length) {
            return { comments: [], users: {}, countTotal: 0, countNew: 0, canModerate, canReply };
        }

        const { tree, users, countTotal, countNew } = await (canModerate ?
            // Если это модератор данной фотографии или администратор новости
            commentsTreeBuildCanModerate(String(iAm.user._id), comments, previousViewStamp) :
            // Если это зарегистрированный пользователь
            commentsTreeBuildAuth(String(iAm.user._id), comments, previousViewStamp, !obj.nocomments)
        );

        return ({ comments: tree, users, countTotal, countNew, canModerate, canReply });
    },
    async getDelTree(iAm, data) {
        const commentModel = data.type === 'news' ? CommentN : Comment;

        const { obj: objId, ...comment } = await commentModel.findOne(
            { cid: data.cid, del: { $exists: true } },
            { _id: 0, hist: 0, 'del.reason': 0, geo: 0, r0: 0, r1: 0, r2: 0, r3: 0, r4: 0, r5: 0, __v: 0 },
            { lean: true }
        ).exec() || {};

        if (!objId) {
            throw { message: msg.noCommentExists };
        }

        const [obj, childs] = await* [
            // Find the object that owns a comment
            data.type === 'news' ? News.findOne({ _id: objId }, { _id: 1, nocomments: 1 }).exec() :
                photoController.findPhoto(iAm, { _id: objId }),
            // Take all removed comments, created after requested and below it
            commentModel.find(
                {
                    obj: objId, del: { $exists: true },
                    stamp: { $gte: comment.stamp }, level: { $gt: comment.level || 0 }
                },
                { _id: 0, obj: 0, hist: 0, 'del.reason': 0, geo: 0, r0: 0, r1: 0, r2: 0, r3: 0, r4: 0, r5: 0, __v: 0 },
                { lean: true, sort: { stamp: 1 } }
            ).exec()
        ];

        if (!obj) {
            throw { message: msg.noObject };
        }

        const canModerate = permissions.canModerate(data.type, obj, iAm);
        const commentsTree = await commentsTreeBuildDel(
            comment, childs, canModerate ? undefined : String(iAm.user._id)
        );

        return { comments: commentsTree.tree, users: commentsTree.users };
    }
};

// Select comments for object
async function getCommentsObj(iAm, data) {
    if (!_.isObject(data) || !Number(data.cid)) {
        throw { message: msg.badParams };
    }

    data.cid = Number(data.cid);

    const result = await (iAm.registered ? core.getCommentsObjAuth(iAm, data) : core.getCommentsObjAnonym(iAm, data));

    result.cid = data.cid;

    return result;
};

// Select branch of removed comments starting from requested
async function getDelTree(iAm, data) {
    if (!_.isObject(data) || !Number(data.cid)) {
        throw { message: msg.badParams };
    }

    data.cid = Number(data.cid);

    const result = await core.getDelTree(iAm, data);
    result.cid = data.cid;

    return result;
};

// Select comment of user
async function getCommentsUser(data) {
    if (!_.isObject(data) || !data.login) {
        throw { message: msg.badParams };
    }

    const userid = await User.getUserID(data.login);

    if (!userid) {
        throw { message: msg.noUser };
    }

    const page = (Math.abs(Number(data.page)) || 1) - 1;
    const skip = page * commentsUserPerPage;

    const comments = await Comment.find(
        { user: userid, del: null, hidden: null },
        { _id: 0, lastChanged: 1, cid: 1, obj: 1, stamp: 1, txt: 1 },
        { lean: true, sort: { stamp: -1 }, skip, limit: commentsUserPerPage }
    ).exec();

    if (_.isEmpty(comments)) {
        return { page: data.page, comments: [], photos: {} };
    }

    // Make array of unique values of photo _ids
    const photoIdsSet = comments.reduce((result, { obj }) => result.add(String(obj)), new Set());
    const photos = await Photo.find(
        { _id: { $in: [...photoIdsSet] } }, { _id: 1, cid: 1, file: 1, title: 1, year: 1, year2: 1 }, { lean: true }
    ).exec();

    if (_.isEmpty(photos)) {
        throw { message: msg.noObject };
    }

    const photoFormattedHashCid = {};
    const photoFormattedHashId = {};
    const commentsArrResult = [];

    for (const { _id, cid, file, title, year, year2 } of photos) {
        photoFormattedHashCid[cid] = photoFormattedHashId[_id] = { cid, file, title, year, year2 };
    }

    // For each comment check public photo existens and assign to comment photo cid
    for (const comment of comments) {
        if (photoFormattedHashId[comment.obj] !== undefined) {
            comment.obj = photoFormattedHashId[comment.obj].cid;
            commentsArrResult.push(comment);
        }
    }

    return { page: data.page, comments: commentsArrResult, photos: photoFormattedHashCid };
};

// Take comments
const getComments = (function () {
    const commentSelect = { _id: 0, cid: 1, obj: 1, user: 1, txt: 1 };
    const photosSelectAllRegions = Object.assign(
        { _id: 1, cid: 1, file: 1, title: 1, geo: 1 }, regionController.regionsAllSelectHash
    );

    return async function (iAm, query, data) {
        const skip = Math.abs(Number(data.skip)) || 0;
        const limit = Math.min(data.limit || 30, 100);
        const options = { lean: true, limit, sort: { stamp: -1 } };
        const photosHash = {};
        const usersHash = {};

        if (skip) {
            options.skip = skip;
        }

        const comments = await Comment.find(query, commentSelect, options).exec();
        const photosArr = [];
        const usersArr = [];

        for (const { obj: photoId, user: userId } of comments) {
            if (photosHash[photoId] === undefined) {
                photosHash[photoId] = true;
                photosArr.push(photoId);
            }

            if (usersHash[userId] === undefined) {
                usersHash[userId] = true;
                usersArr.push(userId);
            }
        }

        const [photos, users] = await* [
            Photo.find(
                { _id: { $in: photosArr } },
                iAm && iAm.rshortsel ?
                    Object.assign({ _id: 1, cid: 1, file: 1, title: 1, geo: 1 }, iAm.rshortsel) :
                    photosSelectAllRegions,
                { lean: true }
            ).exec(),
            User.find({ _id: { $in: usersArr } }, { _id: 1, login: 1, disp: 1 }, { lean: true }).exec()
        ];

        const shortRegionsHash = regionController.genObjsShortRegionsArr(photos, iAm && iAm.rshortlvls || undefined);
        const photoFormattedHash = {};
        const userFormattedHash = {};

        // rs - Regions array for short view
        for (const { _id: PhotoId, cid, file, title, rs } of photos) {
            photoFormattedHash[cid] = photosHash[PhotoId] = { cid, file, title, rs };
        }

        for (const { _id, login, disp } of users) {
            userFormattedHash[login] = usersHash[_id] = { login, disp, online: session.usLogin[login] !== undefined };
        }

        for (const comment of comments) {
            comment.obj = photosHash[comment.obj].cid;
            comment.user = usersHash[comment.user].login;
        }

        return { comments, users: userFormattedHash, photos: photoFormattedHash, regions: shortRegionsHash };
    };
}());

// Take last comments of public photos
const getCommentsFeed = (function () {
    const globalOptions = { limit: 30 };
    const globalFeed = Utils.memoizePromise(
        () => getComments(undefined, { del: null, hidden: null }, globalOptions), ms('10s')
    );

    return iAm => {
        if (_.isEmpty(iAm.rquery)) {
            // User withot region filter will get memozed result for global selection
            return globalFeed();
        } else {
            return getComments(iAm, Object.assign({ del: null, hidden: null }, iAm.rquery), globalOptions);
        }
    };
}());

/**
 * Создает комментарий
 * @param socket Сокет пользователя
 * @param data Объект
 */
async function createComment(socket, data) {
    const iAm = socket.handshake.usObj;

    if (!iAm.registered) {
        throw { message: msg.deny };
    }

    if (!_.isObject(data) || !Number(data.obj) || !data.txt || data.level > 9) {
        throw { message: msg.badParams };
    }
    if (data.txt.length > commentMaxLength) {
        throw { message: msg.maxLength };
    }

    const fragAdded = data.type === 'photo' && !data.frag && _.isObject(data.fragObj);
    const CommentModel = data.type === 'news' ? CommentN : Comment;
    const objCid = Number(data.obj);
    const stamp = new Date();

    const [obj, parent] = await* [
        data.type === 'news' ? News.findOne({ cid: objCid }, { _id: 1, ccount: 1, nocomments: 1 }).exec() :
            photoController.findPhoto(iAm, { cid: objCid }),
        data.parent ? CommentModel.findOne({ cid: data.parent }, { _id: 0, level: 1, del: 1 }, { lean: true }).exec() :
            null
    ];

    if (!obj) {
        throw { message: msg.noObject };
    }
    if (!permissions.canReply(data.type, obj, iAm) && !permissions.canModerate(data.type, obj, iAm)) {
        throw { message: obj.nocomments ? msg.noComments : msg.deny };
    }
    if (data.parent && (!parent || parent.del || parent.level >= 9 || data.level !== (parent.level || 0) + 1)) {
        throw { message: 'Something wrong with parent comment. Maybe it was removed. Please, refresh the page' };
    }

    const { next: cid } = await Counter.increment('comment');
    if (!cid) {
        throw { message: 'Increment comment counter error' };
    }

    const comment = { cid, obj, user: iAm.user, stamp, txt: Utils.inputIncomingParse(data.txt).result, del: undefined };

    // If it comment for photo, assign photo's regions to it
    if (data.type === 'photo') {
        if (obj.geo) {
            comment.geo = obj.geo;
        }
        for (let i = 0; i <= maxRegionLevel; i++) {
            comment['r' + i] = obj['r' + i] || undefined;
        }
    }
    if (data.parent) {
        comment.parent = data.parent;
        comment.level = data.level;
    }
    if (obj.s !== undefined && obj.s !== constants.photo.status.PUBLIC) {
        comment.hidden = true;
    }
    if (fragAdded) {
        comment.frag = true;
    }

    await new CommentModel(comment).save();

    if (fragAdded) {
        if (!obj.frags) {
            obj.frags = [];
        }
        obj.frags.push({
            cid,
            l: Utils.math.toPrecision(Number(data.fragObj.l) || 0, 2),
            t: Utils.math.toPrecision(Number(data.fragObj.t) || 0, 2),
            w: Utils.math.toPrecision(Number(data.fragObj.w) || 20, 2),
            h: Utils.math.toPrecision(Number(data.fragObj.h) || 15, 2)
        });
    }

    obj.ccount = (obj.ccount || 0) + 1;
    const promises = [obj.save()];

    if (!comment.hidden) {
        iAm.user.ccount += 1;
        promises.push(iAm.user.save());
        promises.push(userObjectRelController.onCommentAdd(obj._id, iAm.user._id, data.type));
    }

    await* promises;

    comment.user = iAm.user.login;
    comment.obj = objCid;
    comment.can = {};

    if (comment.level === undefined) {
        comment.level = 0;
    }

    session.emitUser(iAm, null, socket);
    subscrController.commentAdded(obj._id, iAm.user, stamp);

    return { comment, frag: obj.fragObj };
};

/**
 * Remove comment and its children
 * @param socket User's socket
 * @param data
 */
async function removeComment(socket, data) {
    const iAm = socket.handshake.usObj;

    if (!iAm.registered) {
        throw { message: msg.deny };
    }
    if (!_.isObject(data) || !Number(data.cid) || !data.reason || (!Number(data.reason.cid) && !data.reason.desc)) {
        throw { message: msg.badParams };
    }

    const cid = Number(data.cid);
    const commentModel = data.type === 'news' ? CommentN : Comment;

    const comment = await commentModel.findOne(
        { cid, del: null }, { _id: 1, obj: 1, user: 1, stamp: 1, hidden: 1 }, { lean: true }
    ).exec();

    if (!comment) {
        throw { message: msg.noCommentExists };
    }

    const obj = await (data.type === 'news' ?
        News.findOne({ _id: comment.obj }, { _id: 1, ccount: 1, nocomments: 1 }).exec() :
        photoController.findPhoto(iAm, { _id: comment.obj })
    );

    if (!obj) {
        throw { message: msg.noObject };
    }

    // Count amout of unremoved children
    const childCount = await commentModel.count({ obj: obj._id, parent: cid, del: null }).exec();

    // Regular user can remove if there no unremoved comments and it's his own fresh comment
    const canEdit = !childCount && permissions.canEdit(comment, obj, iAm);
    let canModerate;

    if (!canEdit) {
        // Otherwise moderation rights needed
        canModerate = permissions.canModerate(data.type, obj, iAm);

        if (!canModerate) {
            throw { message: obj.nocomments ? msg.noComments : msg.deny };
        }
    }

    // Find all unremoved comments of this object which below of current level and created after it
    // Among them we'll find directly descendants of removing
    const children = childCount ? await commentModel.find(
        { obj: obj._id, del: null, stamp: { $gte: comment.stamp }, level: { $gt: comment.level || 0 } },
        { _id: 0, obj: 0, txt: 0, hist: 0 },
        { lean: true, sort: { stamp: 1 } }
    ).exec() : [];

    const childsCids = [];
    const commentsForRelArr = [];
    const commentsSet = new Set();
    const usersCountMap = new Map();
    const delInfo = { user: iAm.user._id, stamp: new Date(), reason: {} };

    comment.user = String(comment.user); // For Map key

    if (!comment.hidden) {
        // If comment already hidden (ie. object is nut public), we don't need to substruct it from public statistic
        usersCountMap.set(comment.user, 1);
        commentsForRelArr.push(comment);
    }

    // Find directly descendants of removing comment by filling commentsSet
    commentsSet.add(cid);
    for (const child of children) {
        child.user = String(child.user);

        if (child.level && commentsSet.has(child.parent) && !child.del) {
            if (!child.hidden) {
                usersCountMap.set(child.user, (usersCountMap.get(child.user) || 0) + 1);
                commentsForRelArr.push(child);
            }
            childsCids.push(child.cid);
            commentsSet.add(child.cid);
        }
    }

    // If moderator/administrator role was used, track it for this moment
    if (canModerate && iAm.user.role) {
        delInfo.role = iAm.user.role;

        // In case of region moderator 'permissions.canModerate' returns 'cid' of region
        if (iAm.isModerator && _.isNumber(canModerate)) {
            delInfo.roleregion = canModerate;
        }
    }

    if (Number(data.reason.cid)) {
        delInfo.reason.cid = Number(data.reason.cid);
    }
    if (data.reason.desc) {
        delInfo.reason.desc = Utils.inputIncomingParse(data.reason.desc).result;
    }

    await commentModel.update({ cid }, { $set: { lastChanged: delInfo.stamp, del: delInfo } }).exec();

    const countCommentsRemoved = (childsCids.length || 0) + 1;

    if (childsCids.length) {
        const delInfoChilds = Object.assign(_.omit(delInfo, 'reason'), { origin: cid });

        await commentModel.update(
            { cid: { $in: childsCids } },
            { $set: { lastChanged: delInfo.stamp, del: delInfoChilds } },
            { multi: true }
        ).exec();
    }

    let frags = obj.frags && obj.frags.toObject();
    let frag;

    if (!_.isEmpty(frags)) {
        for (frag of frags) {
            if (commentsSet.has(frag.cid)) {
                obj.frags.id(frag._id).del = true;
            }
        }
    }

    obj.ccount -= countCommentsRemoved;
    const promises = [obj.save()];

    for (const [userId, count] of usersCountMap) {
        const userObj = session.getOnline(null, userId);

        if (userObj !== undefined) {
            userObj.user.ccount = userObj.user.ccount - count;
            promises.push(session.saveEmitUser(userObj));
        } else {
            promises.push(User.update({ _id: userId }, { $inc: { ccount: -count } }).exec());
        }
    }

    if (commentsForRelArr.length) {
        promises.push(userObjectRelController.onCommentsRemove(obj._id, commentsForRelArr, data.type));
    }

    await* promises;

    // Pass to client only fragments of unremoved comments, for replacement on client
    if (obj.frags) {
        obj.frags = obj.frags.toObject();

        frags = [];
        for (frag of obj.frags) {
            if (!frag.del) {
                frags.push(frag);
            }
        }
    } else {
        frags = undefined;
    }

    actionLogController.logIt(
        iAm.user,
        comment._id,
        actionLogController.OBJTYPES.COMMENT,
        actionLogController.TYPES.REMOVE,
        delInfo.stamp,
        delInfo.reason,
        delInfo.roleregion,
        childsCids.length ? { childs: childsCids.length } : undefined
    );

    return {
        frags,
        delInfo,
        stamp: delInfo.stamp.getTime(),
        countUsers: usersCountMap.size,
        countComments: countCommentsRemoved,
        myCountComments: usersCountMap.get(String(iAm.user._id)) || 0 // Number of my removed comments
    };
};

// Restore comment and its descendants
async function restoreComment(socket, { cid, type } = {}) {
    const iAm = socket.handshake.usObj;

    if (!iAm.registered) {
        throw { message: msg.deny };
    }

    cid = Number(cid);

    if (!cid) {
        throw { message: msg.badParams };
    }

    const commentModel = type === 'news' ? CommentN : Comment;
    const comment = await commentModel.findOne(
        { cid, del: { $exists: true } }, { _id: 1, obj: 1, user: 1, stamp: 1, hidden: 1, del: 1 }, { lean: true }
    ).exec();

    if (!comment) {
        throw { message: msg.noCommentExists };
    }

    const obj = await (type === 'news' ?
        News.findOne({ _id: comment.obj }, { _id: 1, ccount: 1, nocomments: 1 }).exec() :
        photoController.findPhoto(iAm, { _id: comment.obj })
    );

    if (!obj) {
        throw { message: msg.noObject };
    }

    const canModerate = permissions.canModerate(type, obj, iAm);
    if (!canModerate) {
        throw { message: msg.deny };
    }

    // Find all comments directly descendants to restoring, which were deleted with it,
    // eg theirs 'origin' refers to the current
    const children = await commentModel.find(
        { obj: obj._id, 'del.origin': cid }, { _id: 0, obj: 0, txt: 0, hist: 0 }, { lean: true, sort: { stamp: 1 } }
    ).exec();

    const stamp = new Date();
    const commentsForRelArr = [];
    const usersCountMap = new Map();
    const commentsCidSet = new Set();

    comment.user = String(comment.user); // For Map key

    commentsCidSet.add(cid);
    if (!comment.hidden) {
        usersCountMap.set(comment.user, 1);
        commentsForRelArr.push(comment);
    }

    const childsCids = [];
    // Loop by children for restoring comment
    for (const child of children) {
        child.user = String(child.user);

        if (!child.hidden) {
            usersCountMap.set(child.user, (usersCountMap.get(child.user) || 0) + 1);
            commentsForRelArr.push(child);
        }

        childsCids.push(child.cid);
        commentsCidSet.add(child.cid);
    }

    const hist = [
        Object.assign(_.omit(comment.del, 'origin'), { del: { reason: comment.del.reason } }),
        { user: iAm.user._id, stamp, restore: true, role: iAm.user.role }
    ];
    if (iAm.isModerator && _.isNumber(canModerate)) {
        hist[1].roleregion = canModerate;
    }

    await commentModel.update(
        { cid }, { $set: { lastChanged: stamp }, $unset: { del: 1 }, $push: { hist: { $each: hist } }}
    ).exec();

    if (childsCids.length) {
        const histChilds = [
            Object.assign(_.omit(comment.del, 'reason'), { del: { origin: cid } }),
            { user: iAm.user._id, stamp, restore: true, role: iAm.user.role }
        ];

        if (iAm.isModerator && _.isNumber(canModerate)) {
            histChilds[1].roleregion = canModerate;
        }

        await commentModel.update({ obj: obj._id, 'del.origin': cid }, {
            $set: { lastChanged: stamp },
            $unset: { del: 1 },
            $push: { hist: { $each: histChilds } }
        }, { multi: true }).exec();
    }

    let frags = obj.frags && obj.frags.toObject();
    let frag;

    if (!_.isEmpty(frags)) {
        for (frag of frags) {
            if (commentsCidSet.has(frag.cid)) {
                obj.frags.id(frag._id).del = undefined;
            }
        }
    }

    const countCommentsRestored = children.length + 1;
    obj.ccount += countCommentsRestored;
    const promises = [obj.save()];

    for (const [userId, ccount] of usersCountMap) {
        const userObj = session.getOnline(null, userId);
        if (userObj !== undefined) {
            userObj.user.ccount = userObj.user.ccount + ccount;
            promises.push(session.saveEmitUser(userObj));
        } else {
            promises.push(User.update({ _id: userId }, { $inc: { ccount } }).exec());
        }
    }

    if (commentsForRelArr.length) {
        promises.push(userObjectRelController.onCommentsRestore(obj._id, commentsForRelArr, type));
    }

    await* promises;

    // Pass to client only fragments of unremoved comments, for replacement on client
    if (obj.frags) {
        obj.frags = obj.frags.toObject();

        frags = [];
        for (frag of obj.frags) {
            if (!frag.del) {
                frags.push(frag);
            }
        }
    } else {
        frags = undefined;
    }

    actionLogController.logIt(
        iAm.user,
        comment._id,
        actionLogController.OBJTYPES.COMMENT,
        actionLogController.TYPES.RESTORE,
        stamp,
        undefined,
        iAm.isModerator && _.isNumber(canModerate) ? canModerate : undefined,
        childsCids.length ? { childs: childsCids.length } : undefined
    );

    return {
        frags,
        stamp: stamp.getTime(),
        countUsers: usersCountMap.size,
        countComments: countCommentsRestored,
        myCountComments: usersCountMap.has(String(iAm.user._id))
    };
};

// Edit comment
async function updateComment(socket, data = {}) {
    const iAm = socket.handshake.usObj;

    if (!iAm.registered) {
        throw { message: msg.deny };
    }

    const cid = Number(data.cid);

    if (!data.obj || !cid || !data.txt) {
        throw { message: msg.badParams };
    }

    if (data.txt.length > commentMaxLength) {
        throw { message: msg.maxLength };
    }

    const [obj, comment] = await* (data.type === 'news' ? [
        News.findOne({ cid: data.obj }, { cid: 1, frags: 1, nocomments: 1 }).exec(),
        CommentN.findOne({ cid }).exec()
    ] : [
        photoController.findPhoto(iAm, { cid: data.obj }),
        Comment.findOne({ cid }).exec()
    ]);

    if (!comment || !obj || data.obj !== obj.cid) {
        throw { message: msg.noCommentExists };
    }

    const hist = { user: iAm.user };

    // Ability to edit as regular user, if it' own comment younger than day
    const canEdit = permissions.canEdit(comment, obj, iAm);
    let canModerate;
    if (!canEdit) {
        // В противном случае нужны права модератора/администратора
        canModerate = permissions.canModerate(data.type, obj, iAm);
        if (!canModerate) {
            throw { message: obj.nocomments ? msg.noComments : msg.deny };
        }
    }

    const parsedResult = Utils.inputIncomingParse(data.txt);
    const content = parsedResult.result;
    let fragChangedType;
    let txtChanged;

    const fragExists = _.find(obj.frags, { cid: comment.cid });

    const fragRecieved = data.type === 'photo' && data.fragObj && {
        cid: comment.cid,
        l: Utils.math.toPrecision(Number(data.fragObj.l) || 0, 2),
        t: Utils.math.toPrecision(Number(data.fragObj.t) || 0, 2),
        w: Utils.math.toPrecision(Number(data.fragObj.w) || 20, 2),
        h: Utils.math.toPrecision(Number(data.fragObj.h) || 15, 2)
    };

    if (fragRecieved) {
        if (!fragExists) {
            // If fragment was received and had not had exist before, simply append it
            fragChangedType = 1;
            comment.frag = true;
            obj.frags = obj.frags || [];
            obj.frags.push(fragRecieved);
        } else if (fragRecieved.l !== fragExists.l || fragRecieved.t !== fragExists.t ||
            fragRecieved.w !== fragExists.w || fragRecieved.h !== fragExists.h) {
            // If fragment was received and had had exist before, but something changed in it,
            // then remove old and append new one
            fragChangedType = 2;
            obj.frags = obj.frags || [];
            obj.frags.pull(fragExists._id);
            obj.frags.push(fragRecieved);
        }
    } else if (fragExists) {
        // If fragment wasn't recieved, but it had had exist before, simply remove it
        fragChangedType = 3;
        comment.frag = undefined;
        obj.frags = obj.frags || [];
        obj.frags.pull(fragExists._id);
    }

    if (content !== comment.txt) {
        // Save current text (before edit) to history object
        hist.txt = comment.txt;
        // Get formatted difference of current and new tests (unformatted) and save to history object
        hist.txtd = Utils.txtdiff(Utils.txtHtmlToPlain(comment.txt), parsedResult.plain);
        txtChanged = true;
    }

    if (txtChanged || fragChangedType) {
        hist.frag = fragChangedType || undefined;

        if (canModerate && iAm.user.role) {
            // If moderator/administrator role was used for editing, save it on the moment of editing
            hist.role = iAm.user.role;
            if (iAm.isModerator && _.isNumber(canModerate)) {
                hist.roleregion = canModerate; // In case of moderator 'permissions.canModerate' returns role cid
            }
        }

        comment.hist.push(hist);
        comment.lastChanged = new Date();
        comment.txt = content;

        await* [comment.save(), fragChangedType ? obj.save() : null];
    }

    return { comment: comment.toObject({ transform: commentDeleteHist }), frag: fragRecieved };
};
function commentDeleteHist(doc, ret/* , options */) {
    delete ret.hist;
}

/**
 * Returns the history of comment's editing
 * Stored by lines in db. Each line contains one event
 * Event can contain 2 indicator: change of text or(and) fragment.
 * Event contains previous text, eg it was written in comment at another time (at the time of another event), but
 * flag about changing of fragment refers to exactly this event.
 * Therefore, one line contains events from 2 different times.
 * To show it in readable view to user,
 * we need move changed text to the time of previous text change,
 * and current event show only if it contains fragment's change
 * or in next steps will be text change and it will move to time of this event.
 * In other words event really will be shoed,
 * if it contains a fragment's change or text modification in another event in the future
 */
async function giveCommentHist({ cid, type = 'photo' } = {}) {
    cid = Number(cid);

    if (!cid) {
        throw { message: msg.badParams };
    }

    const commentModel = type === 'news' ? CommentN : Comment;

    const comment = await commentModel.findOne(
        { cid }, { _id: 0, user: 1, txt: 1, txtd: 1, stamp: 1, hist: 1, del: 1 }, { lean: true }
    ).populate({ path: 'user hist.user del.user', select: { _id: 0, login: 1, avatar: 1, disp: 1 } }).exec();

    if (!comment) {
        throw { message: msg.noCommentExists };
    }

    const result = [];
    const hists = comment.hist || [];

    // First record about text changing will be equal to comment creation
    let lastTxtObj = { user: comment.user, stamp: comment.stamp };
    let lastTxtIndex = 0; // Position of last text change in events stack

    const getregion = function (regionId) {
        if (regionId) {
            let result = regionController.getRegionsHashFromCache([regionId])[regionId];

            if (result) {
                result = _.omit(result, '_id', 'parents');
            }

            return result;
        }
    };

    if (comment.del) {
        hists.push({
            user: comment.del.user,
            stamp: comment.del.stamp,
            del: _.pick(comment.del, 'reason', 'origin'),
            role: comment.del.role,
            roleregion: comment.del.roleregion
        });
    }

    for (let i = 0; i < hists.length; i++) {
        const hist = hists[i];
        const histDel = hist.del;

        if (hist.role && hist.roleregion) {
            hist.roleregion = getregion(hist.roleregion);
        }

        if (histDel || hist.restore) {
            if (histDel && histDel.reason && histDel.reason.cid) {
                histDel.reason.title = giveReasonTitle({ cid: histDel.reason.cid });
            }
            result.push(hist);
        } else {
            if (hist.txt) {
                lastTxtObj.txt = hist.txt; // If text exists, put it to previous record, which changed the text

                if (!lastTxtObj.frag) {
                    // If in those record had no fragment, means record was not append and need to append
                    result.splice(lastTxtIndex, 0, lastTxtObj);
                }

                delete hist.txt; // Remove text from this event and it will be waiting next text changing
                lastTxtIndex = result.length;
                lastTxtObj = hist;
            }

            // If record contains fragment change, append it
            if (hist.frag) {
                result.push(hist);
            }
        }

        // If it was last record (in case of current removal - penultimate) in history
        // and there was text changing earlier,
        // then need to append current text of comment in this last record of text change
        if (i === hists.length - 1 && lastTxtIndex > 0) {
            lastTxtObj.txt = comment.txt;
            if (!lastTxtObj.frag) {
                result.splice(lastTxtIndex, 0, lastTxtObj);
            }
        }
    }

    return { hists: result };
};

// Toggle ability to write comments for object (except administrators)
async function setNoComments(iAm, { cid, type = 'photo', val: nocomments } = {}) {
    if (!iAm.registered || !iAm.user.role) {
        throw { message: msg.deny };
    }

    cid = Number(cid);

    if (!cid) {
        throw { message: msg.badParams };
    }

    const obj = await (type === 'news' ? News.findOne({ cid }).exec() : photoController.findPhoto(iAm, { cid }));

    if (!obj) {
        throw { message: msg.noObject };
    }

    const canModerate = permissions.canModerate(type, obj, iAm);

    if (!canModerate) {
        throw { message: msg.deny };
    }

    let oldPhotoObj;
    if (type === 'photo') {
        oldPhotoObj = obj.toObject();
        obj.cdate = new Date();
    }

    obj.nocomments = nocomments ? true : undefined;
    await obj.save();

    if (type === 'photo') {
        // Save previous value of 'nocomments' in history
        obj.nocomments = !!obj.nocomments; // To set false in history instead of undefined
        photoController.savePhotoHistory(iAm, oldPhotoObj, obj, canModerate);
    }

    return { nocomments: obj.nocomments };
};

/**
 * Hide/show object comments (so doing them unpublic/public)
 * @param oid
 * @param {boolean} hide
 * @param iAm Count how many comments of user are affected
 */
export async function hideObjComments(oid, hide, iAm) {
    const command = {};

    if (hide) {
        command.$set = { hidden: true };
    } else {
        command.$unset = { hidden: 1 };
    }

    const { n: count } = await Comment.update({ obj: oid }, command, { multi: true }).exec();

    if (count === 0) {
        return { myCount: 0 };
    }

    const comments = await Comment.find({ obj: oid }, {}, { lean: true }).exec();

    const usersCountMap = _.transform(comments, (result, comment) => {
        if (comment.del === undefined) {
            const userId = String(comment.user);
            result.set(userId, (result.get(userId) || 0) + 1);
        }
    }, new Map());

    for (const [userId, ccount] of usersCountMap) {
        const cdelta = hide ? -ccount : ccount;
        const userObj = session.getOnline(null, userId);

        if (userObj !== undefined) {
            userObj.user.ccount = userObj.user.ccount + cdelta;
            session.saveEmitUser(userObj);
        } else {
            User.update({ _id: userId }, { $inc: { ccount: cdelta } }).exec();
        }
    };

    return { myCount: usersCountMap.get(String(iAm.user._id)) || 0 };
}

export const loadController = io => {
    io.sockets.on('connection', function (socket) {
        const hs = socket.handshake;

        socket.on('createComment', function (data) {
            createComment(socket, data)
                .catch(function (err) {
                    return { message: err.message, error: true };
                })
                .then(function (resultData) {
                    socket.emit('createCommentResult', resultData);
                });
        });
        socket.on('updateComment', function (data) {
            updateComment(socket, data)
                .catch(function (err) {
                    return { message: err.message, error: true };
                })
                .then(function (resultData) {
                    socket.emit('updateCommentResult', resultData);
                });
        });
        socket.on('giveCommentHist', function (data) {
            giveCommentHist(data)
                .catch(function (err) {
                    return { message: err.message, error: true };
                })
                .then(function (resultData) {
                    socket.emit('takeCommentHist', resultData);
                });
        });
        socket.on('removeComment', function (data) {
            removeComment(socket, data)
                .catch(function (err) {
                    return { message: err.message, error: true };
                })
                .then(function (resultData) {
                    socket.emit('removeCommentResult', resultData);
                });
        });
        socket.on('restoreComment', function (data) {
            restoreComment(socket, data)
                .catch(function (err) {
                    return { message: err.message, error: true };
                })
                .then(function (resultData) {
                    socket.emit('restoreCommentResult', resultData);
                });
        });
        socket.on('setNoComments', function (data) {
            setNoComments(hs.usObj, data)
                .catch(function (err) {
                    return { message: err.message, error: true };
                })
                .then(function (resultData) {
                    socket.emit('setNoCommentsResult', resultData);
                });
        });
        socket.on('giveCommentsObj', function (data) {
            getCommentsObj(hs.usObj, data)
                .catch(function (err) {
                    return { message: err.message, error: true };
                })
                .then(function (resultData) {
                    socket.emit('takeCommentsObj', resultData);
                });
        });
        socket.on('giveCommentsDel', function (data) {
            getDelTree(hs.usObj, data)
                .catch(function (err) {
                    return { message: err.message, error: true };
                })
                .then(function (resultData) {
                    socket.emit('takeCommentsDel', resultData);
                });
        });
        socket.on('giveCommentsUser', function (data) {
            getCommentsUser(data)
                .catch(function (err) {
                    return { message: err.message, error: true };
                })
                .then(function (resultData) {
                    socket.emit('takeCommentsUser', resultData);
                });
        });
        socket.on('giveCommentsFeed', function () {
            getCommentsFeed(hs.usObj)
                .catch(function (err) {
                    return { message: err.message, error: true };
                })
                .then(function (resultData) {
                    socket.emit('takeCommentsFeed', resultData);
                });
        });
    });
};