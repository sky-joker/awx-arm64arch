import React, { Component, Fragment } from 'react';
import { number, shape, string, bool } from 'prop-types';
import { withRouter } from 'react-router-dom';
import { withI18n } from '@lingui/react';
import { t } from '@lingui/macro';

import { OrganizationsAPI } from '@api';
import AlertModal from '@components/AlertModal';
import ErrorDetail from '@components/ErrorDetail';
import NotificationListItem from '@components/NotificationsList/NotificationListItem';
import PaginatedDataList from '@components/PaginatedDataList';
import { getQSConfig, parseNamespacedQueryString } from '@util/qs';

const QS_CONFIG = getQSConfig('notification', {
  page: 1,
  page_size: 5,
  order_by: 'name',
});

const COLUMNS = [
  { key: 'name', name: 'Name', isSortable: true },
  { key: 'modified', name: 'Modified', isSortable: true, isNumeric: true },
  { key: 'created', name: 'Created', isSortable: true, isNumeric: true },
];

class OrganizationNotifications extends Component {
  constructor(props) {
    super(props);
    this.state = {
      contentError: null,
      hasContentLoading: true,
      toggleError: null,
      toggleLoading: false,
      itemCount: 0,
      notifications: [],
      successTemplateIds: [],
      errorTemplateIds: [],
      typeLabels: null,
    };
    this.handleNotificationToggle = this.handleNotificationToggle.bind(this);
    this.handleNotificationErrorClose = this.handleNotificationErrorClose.bind(
      this
    );
    this.loadNotifications = this.loadNotifications.bind(this);
  }

  componentDidMount() {
    this.loadNotifications();
  }

  componentDidUpdate(prevProps) {
    const { location } = this.props;
    if (location !== prevProps.location) {
      this.loadNotifications();
    }
  }

  async loadNotifications() {
    const { id, location } = this.props;
    const { typeLabels } = this.state;
    const params = parseNamespacedQueryString(QS_CONFIG, location.search);

    const promises = [OrganizationsAPI.readNotificationTemplates(id, params)];

    if (!typeLabels) {
      promises.push(OrganizationsAPI.readOptionsNotificationTemplates(id));
    }

    this.setState({ contentError: null, hasContentLoading: true });
    try {
      const [
        {
          data: { count: itemCount = 0, results: notifications = [] },
        },
        optionsResponse,
      ] = await Promise.all(promises);

      let idMatchParams;
      if (notifications.length > 0) {
        idMatchParams = { id__in: notifications.map(n => n.id).join(',') };
      } else {
        idMatchParams = {};
      }

      const [
        { data: successTemplates },
        { data: errorTemplates },
      ] = await Promise.all([
        OrganizationsAPI.readNotificationTemplatesSuccess(id, idMatchParams),
        OrganizationsAPI.readNotificationTemplatesError(id, idMatchParams),
      ]);

      const stateToUpdate = {
        itemCount,
        notifications,
        successTemplateIds: successTemplates.results.map(s => s.id),
        errorTemplateIds: errorTemplates.results.map(e => e.id),
      };

      if (!typeLabels) {
        const {
          data: {
            actions: {
              GET: {
                notification_type: { choices },
              },
            },
          },
        } = optionsResponse;
        // The structure of choices looks like [['slack', 'Slack'], ['email', 'Email'], ...]
        stateToUpdate.typeLabels = choices.reduce(
          (map, notifType) => ({ ...map, [notifType[0]]: notifType[1] }),
          {}
        );
      }

      this.setState(stateToUpdate);
    } catch (err) {
      this.setState({ contentError: err });
    } finally {
      this.setState({ hasContentLoading: false });
    }
  }

  async handleNotificationToggle(notificationId, isCurrentlyOn, status) {
    const { id } = this.props;

    let stateArrayName;
    if (status === 'success') {
      stateArrayName = 'successTemplateIds';
    } else {
      stateArrayName = 'errorTemplateIds';
    }

    let stateUpdateFunction;
    if (isCurrentlyOn) {
      // when switching off, remove the toggled notification id from the array
      stateUpdateFunction = prevState => ({
        [stateArrayName]: prevState[stateArrayName].filter(
          i => i !== notificationId
        ),
      });
    } else {
      // when switching on, add the toggled notification id to the array
      stateUpdateFunction = prevState => ({
        [stateArrayName]: prevState[stateArrayName].concat(notificationId),
      });
    }

    this.setState({ toggleLoading: true });
    try {
      await OrganizationsAPI.updateNotificationTemplateAssociation(
        id,
        notificationId,
        status,
        !isCurrentlyOn
      );
      this.setState(stateUpdateFunction);
    } catch (err) {
      this.setState({ toggleError: err });
    } finally {
      this.setState({ toggleLoading: false });
    }
  }

  handleNotificationErrorClose() {
    this.setState({ toggleError: null });
  }

  render() {
    const { canToggleNotifications, i18n } = this.props;
    const {
      contentError,
      hasContentLoading,
      toggleError,
      toggleLoading,
      itemCount,
      notifications,
      successTemplateIds,
      errorTemplateIds,
      typeLabels,
    } = this.state;

    return (
      <Fragment>
        <PaginatedDataList
          contentError={contentError}
          hasContentLoading={hasContentLoading}
          items={notifications}
          itemCount={itemCount}
          itemName="notification"
          qsConfig={QS_CONFIG}
          toolbarColumns={COLUMNS}
          renderItem={notification => (
            <NotificationListItem
              key={notification.id}
              notification={notification}
              detailUrl={`/notifications/${notification.id}`}
              canToggleNotifications={canToggleNotifications && !toggleLoading}
              toggleNotification={this.handleNotificationToggle}
              errorTurnedOn={errorTemplateIds.includes(notification.id)}
              successTurnedOn={successTemplateIds.includes(notification.id)}
              typeLabels={typeLabels}
            />
          )}
        />
        <AlertModal
          isOpen={toggleError}
          variant="danger"
          title={i18n._(t`Error!`)}
          onClose={this.handleNotificationErrorClose}
        >
          {i18n._(t`Failed to toggle notification.`)}
          <ErrorDetail error={toggleError} />
        </AlertModal>
      </Fragment>
    );
  }
}

OrganizationNotifications.propTypes = {
  id: number.isRequired,
  canToggleNotifications: bool.isRequired,
  location: shape({
    search: string.isRequired,
  }).isRequired,
};

export { OrganizationNotifications as _OrganizationNotifications };
export default withI18n()(withRouter(OrganizationNotifications));
