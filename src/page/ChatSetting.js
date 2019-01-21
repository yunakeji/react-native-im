import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import PropTypes from 'prop-types';
import { getSafeAreaInset } from 'react-native-pure-navigation-bar';
import * as Constant from '../constant';
import * as Types from '../proptype';
import delegate from '../delegate';
import i18n from '../../language';

export default class extends React.PureComponent {
    static navigationOptions = function ({navigation}) {
        const {chatType} = navigation.state.params;
        const isGroup = chatType === Constant.ChatType.Group;
        const title = isGroup ? i18n.t('IMPageChatSettingTitleGroup') : i18n.t('IMPageChatSettingTitleSingle');
        return {title};
    };

    static propTypes = {
        ...Types.BasicConversation,
        ...Types.Navigation,
        sections: PropTypes.arrayOf(PropTypes.arrayOf(PropTypes.string)),
        buttons: PropTypes.arrayOf(PropTypes.string),
    };

    static defaultProps = {
        sections: [],
        buttons: [],
    };

    render() {
        const style = {
            backgroundColor: delegate.style.viewBackgroundColor,
        };
        const bottomItems = this._renderItems(this.props.buttons, this._renderVerticalLine.bind(this));
        const hasBottom = bottomItems.length > 0;
        const marginBottom = hasBottom ? getSafeAreaInset().bottom + 50 : 0;
        return (
            <View style={[styles.view, style]}>
                <ScrollView
                    style={[styles.scrollView, {marginBottom}]}
                >
                    {this._renderSections()}
                </ScrollView>
                {hasBottom && this._renderBottom(bottomItems)}
            </View>
        );
    }

    _renderSections() {
        const views = [];
        this.props.sections.forEach((section, index) => {
            const items = this._renderItems(section, this._renderHorizontalLine.bind(this));
            if (items.length > 0) {
                views.push((
                    <View key={index} style={styles.section}>
                        {items}
                    </View>
                ));
            }
        });
        return views;
    }

    _renderBottom(bottomItems) {
        const {bottom} = getSafeAreaInset();
        return (
            <View style={[styles.bottom, {bottom}]}>
                {bottomItems}
            </View>
        );
    }

    _renderItems(items, renderSeperator) {
        const buttons = [];
        items.forEach((button, index) => {
            const view = delegate.model.Setting.match(button, {
                ...this.props,
                key: index,
                onDataChange: this._onDataChange.bind(this),
            });
            if (!view) {
                return;
            }
            buttons.push(view);
            buttons.push(renderSeperator(index + items.length));
        });
        const views = buttons.length > 0 ? buttons.slice(0, buttons.length - 1) : buttons;
        return views;
    }

    _renderVerticalLine(key) {
        const style = {
            backgroundColor: delegate.style.separatorLineColor,
        };
        return <View key={key} style={[styles.vertical, style]} />;
    }

    _renderHorizontalLine(key) {
        const style = {
            backgroundColor: delegate.style.separatorLineColor,
        };
        return <View key={key} style={[styles.horizontal, style]} />;
    }

    _onDataChange() {
        this.forceUpdate();
    }
}

const styles = StyleSheet.create({
    view: {
        flex: 1,
    },
    scrollView: {
        flex: 1,
        backgroundColor: 'transparent',
    },
    section: {
        marginTop: 10,
        backgroundColor: 'white',
    },
    bottom: {
        position: 'absolute',
        left: 0,
        right: 0,
        flexDirection: 'row',
        backgroundColor: 'white',
        height: 50,
    },
    vertical: {
        width: StyleSheet.hairlineWidth,
        height: 50,
    },
    horizontal: {
        height: StyleSheet.hairlineWidth,
    },
});