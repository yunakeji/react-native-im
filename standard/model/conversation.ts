import AsyncStorage from 'react-native-general-storage';
import Listener from 'react-native-general-listener';
import { Conversation, Message, Event, Storage } from '../typings';
import * as Action from './action';
import { simpleExport } from '../util';
import delegate from '../delegate';

const rootNode: {[imId: string]: Conversation.Item} = {};

export const name = 'im-conversation';

export const defaultConfig: Conversation.Config = {
    top: false,
    showMembersName: true,
    avoid: false,
};

export async function init(forceUpdate: boolean): Promise<void> {
    const getCache = async function (): Promise<void> {
        const items = await AsyncStorage.getKeys(keys(), Storage.Part);
        Object.values(items).forEach((item) => {
            rootNode[item.imId] = item;
        });
    };
    if (forceUpdate) {
        await load().catch(() => getCache());
    } else {
        await getCache();
    }
    onUnreadCountChanged();
}

export async function uninit(forceClear: boolean): Promise<void> {
    const imIds = Object.keys(rootNode);
    imIds.forEach(imId => delete rootNode[imId]);
    if (forceClear) {
        await Promise.all(imIds.map(imId => deleteData(imId)));
    }
}

export async function load(): Promise<void> {
    const result = await delegate.im.conversation.loadList();
    await Promise.all(result.map((item) => {
        rootNode[item.imId] = {...item};
        return loadItem(item.imId, item.chatType);
    }));
}

export async function loadItem(imId: string, chatType: Conversation.ChatType): Promise<Conversation.Item> {
    const result = await delegate.im.conversation.loadItem(imId, chatType, true);
    const message = !result.latestMessage ? null : 
        Action.Parse.get([], result.latestMessage, result.latestMessage);
    if (!rootNode[imId]) {
        rootNode[imId] = {
            ...result,
            latestMessage: message,
            unreadMessagesCount: result.unreadMessagesCount || 0,
            atMe: result.atMe || false,
            config: {
                ...defaultConfig,
                ...result.config || {},
            },
        };
    } else {
        rootNode[imId].unreadMessagesCount = result.unreadMessagesCount || 0;
        const oldMessage = rootNode[imId].latestMessage;
        if (!oldMessage) {
            rootNode[imId].latestMessage = message;
        } else if (message) {
            const {localTime: l1} = oldMessage;
            const {localTime: l2} = message;
            if (l1 < l2) {
                rootNode[imId].latestMessage = message;
            }
        }
    }
    await writeData(imId);
    const isGroup = chatType === Conversation.ChatType.Group;
    if (isGroup && !delegate.model.Group.findByGroupId(imId)) {
        await delegate.model.Group.loadItem(imId);
    }
    return simpleExport(rootNode[imId]);
}

export function isValid(imId: string, chatType: Conversation.ChatType): boolean {
    let item = null;
    if (chatType === Conversation.ChatType.Single) {
        item = delegate.user.getUser(imId);
    } else if (chatType === Conversation.ChatType.Group) {
        item = delegate.model.Group.findByGroupId(imId, false);
    }
    return !!item && !!getOne(imId, false);
}

export function get(): Conversation.Item[] {
    const originItems = Object.values(rootNode);
    const validItems = originItems.filter(item => isValid(item.imId, item.chatType));
    const sortedItems = validItems
        .sort((a, b) => {
            const aTop = a.config.top ? 1 : 0;
            const bTop = b.config.top ? 1 : 0;
            const index = bTop - aTop;
            if (index !== 0) {
                return index;
            } else if (a.latestMessage || b.latestMessage) {
                const aT = a.latestMessage ? a.latestMessage.timestamp : 0;
                const bT = b.latestMessage ? b.latestMessage.timestamp : 0;
                return aT > bT ? -1 : aT < bT ? 1 : 0;
            } else {
                return a.imId.localeCompare(b.imId);
            }
        });
    return simpleExport(sortedItems);
}

export function getOne(imId: string, enableExport: boolean = true): Conversation.Item | void {
    if (enableExport) {
        return simpleExport(rootNode[imId]);
    } else {
        return rootNode[imId];
    }
}

export function getConfig(imId: string): Conversation.Config {
    const item = getOne(imId, false);
    if (item) {
        return simpleExport(item.config);
    } else {
        return defaultConfig;
    }
}

export function getName(imId: string): string | void {
    const item = getOne(imId, false);
    if (item) {
        if (item.chatType === Conversation.ChatType.Group) {
            return delegate.model.Group.getName(imId, true);
        } else if (item.chatType === Conversation.ChatType.Single) {
            return delegate.user.getUser(imId).name;
        }
    }
    return null;
}

export async function updateConfig(
    imId: string,
    chatType: Conversation.ChatType,
    config: Conversation.ConfigUpdate
): Promise<void> {
    await loadItem(imId, chatType);
    const newConfig = {
        ...getConfig(imId),
        ...config,
    };
    const result = await delegate.im.conversation.updateConfig(imId, newConfig);
    rootNode[imId].config = result;
    Listener.trigger([Event.Base, Event.Conversation, imId]);
    await writeData(imId);
}

export async function updateMessage(imId: string, message: Message.General): Promise<void> {
    const item = getOne(imId, false);
    if (!item) {
        return;
    }
    rootNode[imId].latestMessage = message;
    // Has @ or not
    const myUserId = delegate.user.getMine().userId;
    const isFromMe = message.from === myUserId;
    let hasAtMe = false;
    if (item.chatType === Conversation.ChatType.Group && !isFromMe) {
        if (message.data && message.data.atMemberList) {
            if (message.data.atMemberList === Message.AtAll) {
                hasAtMe = true;
            } else {
                hasAtMe = message.data.atMemberList.indexOf(myUserId) >= 0;
            }
        }
    }
    rootNode[imId].atMe = rootNode[imId].atMe || hasAtMe;
    Listener.trigger([Event.Base, Event.Conversation, imId]);
    await loadItem(imId, item.chatType);
    Listener.trigger([Event.Base, Event.UnreadCount, imId]);
    onUnreadCountChanged();
}

export async function deleteOne(imId: string): Promise<void> {
    if (!rootNode[imId]) {
        return;
    }
    await delegate.im.conversation.deleteOne(imId);
    delete rootNode[imId];
    Listener.trigger([Event.Base, Event.Conversation]);
    await deleteData(imId);
    onUnreadCountChanged();
}

export async function createOne(memberUserIds: string | string[]): Promise<Conversation.Item> {
    const members = Array.isArray(memberUserIds) ? memberUserIds : [memberUserIds];
    const isGroup = members.length > 1;
    const chatType: Conversation.ChatType = isGroup ? Conversation.ChatType.Group : Conversation.ChatType.Single;
    if (isGroup) {
        const result = await delegate.model.Group.createOne(members);
        return await loadItem(result.groupId, chatType);
    } else {
        const imId = members[0];
        const existItem = getOne(imId, false);
        if (existItem) {
            return simpleExport(existItem);
        } else {
            return await loadItem(imId, chatType);
        }
    }
}

export async function markReadStatus(imId: string, chatType: Conversation.ChatType, status: boolean): Promise<void> {
    if (status) {
        await delegate.im.conversation.markAllRead(imId, chatType);
    } else {
        await delegate.im.conversation.markLatestUnread(imId, chatType);
    }
    if (!rootNode[imId]) {
        return;
    }
    rootNode[imId].unreadMessagesCount = status ? 0 : 1;
    if (status) {
        rootNode[imId].atMe = false;
        Listener.trigger([Event.Base, Event.Conversation, imId]);
    }
    Listener.trigger([Event.Base, Event.UnreadCount, imId]);
    onUnreadCountChanged();
    await writeData(imId);
}

function onUnreadCountChanged(): void {
    const count = Object.values(rootNode)
        .reduce((prv, cur) => {
            const isAvoid = cur.config.avoid;
            if (!isAvoid && isValid(cur.imId, cur.chatType)) {
                prv += cur.unreadMessagesCount;
            }
            return prv;
        }, 0);
    Listener.trigger([Event.Base, Event.UnreadCount], count);
}

async function writeData(imId: string): Promise<void> {
    await AsyncStorage.set(keys(imId), rootNode[imId], Storage.Part);
}

async function deleteData(imId: string): Promise<void> {
    await AsyncStorage.remove(keys(imId), Storage.Part);
}

function keys(imId?: string): string[] {
    const myUserId = delegate.user.getMine().userId;
    if (imId) {
        return [myUserId, name, imId];
    } else {
        return [myUserId, name];
    }
}