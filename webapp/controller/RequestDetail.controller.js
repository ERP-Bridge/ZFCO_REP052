sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/Table",
    "sap/m/Column",
    "sap/m/ColumnListItem",
    "sap/m/Text",
    "sap/m/Label",
    "sap/m/MessageBox",
    "sap/m/MessageToast",
    "sap/ui/core/routing/History",
    "sap/m/Dialog",
    "sap/m/TextArea",
    "sap/m/Button",
    "sap/m/VBox",
    "sap/ui/core/BusyIndicator",
    "sap/m/Input"
], function (
    Controller,
    JSONModel,
    Table,
    Column,
    ColumnListItem,
    Text,
    Label,
    MessageBox,
    MessageToast,
    History,
    Dialog,
    TextArea,
    Button,
    VBox,
    BusyIndicator,
    Input
) {
    "use strict";

    return Controller.extend(
        "zfcorep052.controller.RequestDetail",
        {
            onInit: function () {
                this.getView().setModel(
                    new JSONModel(
                        this._getEmptyDetailData()
                    ),
                    "detail"
                );

                this.getView().setModel(
                    new JSONModel({
                        busy: false,
                        canApprove: false,
                        editMode: false
                    }),
                    "state"
                );

                this.getOwnerComponent()
                    .getRouter()
                    .getRoute("RouteRequestDetail")
                    .attachPatternMatched(
                        this._onRouteMatched,
                        this
                    );
            },

            _onRouteMatched: function (oEvent) {
                var oArguments =
                    oEvent.getParameter("arguments") || {};

                var sRequestId = decodeURIComponent(
                    oArguments.requestId || ""
                );

                if (!sRequestId) {
                    MessageBox.error(
                        "Request ID is missing."
                    );
                    return;
                }

                this._loadRequest(sRequestId);
            },

            _loadRequest: async function (sRequestId) {
                var oStateModel =
                    this.getView().getModel("state");

                var oDetailModel =
                    this.getView().getModel("detail");

                oStateModel.setProperty("/busy", true);
                oStateModel.setProperty(
                    "/canApprove",
                    false
                );

                try {
                    var oODataModel =
                        this.getOwnerComponent().getModel();

                    if (!oODataModel) {
                        throw new Error(
                            "The default OData V4 model is not configured."
                        );
                    }

                    var sHeaderPath =
                        "/RequestHeader('" +
                        this._encodeODataKey(sRequestId) +
                        "')";

                    var oHeaderBinding =
                        oODataModel.bindContext(
                            sHeaderPath
                        );

                    var oHeader =
                        await oHeaderBinding.requestObject();

                    if (!oHeader) {
                        throw new Error(
                            "The request does not exist."
                        );
                    }

                    var sWorkflowStep =
                        this._normalizeWorkflowStep(
                            oHeader.WorkflowStep
                        );

                    var oStatus =
                        this._getStatusForStep(
                            sWorkflowStep
                        );
                    console.log("Workflow Step:", sWorkflowStep);

                    var sActionType = String(
                        oHeader.ActionType || ""
                    );

                    var oDetailData =
                        this._getEmptyDetailData();

                    oDetailData.requestId =
                        oHeader.RequestId || sRequestId;

                    oDetailData.actionType =
                        sActionType;

                    oDetailData.actionTypeDisplay =
                        this._getActionTypeDisplay(
                            sActionType
                        );

                    oDetailData.country =
                        oHeader.Country || "";

                    oDetailData.workflowStep =
                        sWorkflowStep;

                    oDetailData.submittedBy =
                        oHeader.SubmittedBy || "";

                    oDetailData.submissionDate =
                        this._formatDate(
                            oHeader.SubmittedOn
                        );

                    oDetailData.spoolNumber =
                        this._formatSpoolNumber(
                            oHeader.SpoolNumber
                        );

                    oDetailData.status =
                        oStatus.text;

                    oDetailData.statusState =
                        oStatus.state;
                    oDetailData.simulationStatus =
                        oHeader.SIM_STATUS || "";

                    oDetailData.simulationSpoolNumber =
                        oHeader.SIM_SPOOL_NO || "";

                    oDetailData.simulationLogUrl =
                        oHeader.SimulationLogUrl || "";

                    oDetailData.showSimulationLink =
                        !!oDetailData.simulationSpoolNumber;
                    oDetailData.showSimulateButton =
                        sWorkflowStep === "035";

                    oDetailData.showCloseButton =
                        sWorkflowStep === "035";


                    oDetailData.createdBy =
                        oHeader.CreatedBy || "";

                    oDetailData.createdOn =
                        this._formatDate(
                            oHeader.CreatedOn
                        );

                    oDetailData.changedBy =
                        oHeader.ChangedBy || "";

                    oDetailData.changedOn =
                        this._formatDate(
                            oHeader.ChangedOn
                        );

                    var mConfiguration =
                        this._getEntityConfiguration();

                    var aObjectKeys =
                        Object.keys(mConfiguration);

                    for (
                        var iIndex = 0;
                        iIndex < aObjectKeys.length;
                        iIndex += 1
                    ) {
                        var sObjectKey =
                            aObjectKeys[iIndex];

                        var oConfiguration =
                            mConfiguration[sObjectKey];

                        var aRows =
                            await this._loadChildItems(
                                oODataModel,
                                sHeaderPath,
                                oConfiguration.navigation
                            );

                        oDetailData[
                            oConfiguration.modelProperty
                        ] = aRows;

                        oDetailData.visibleTabs[
                            sObjectKey
                        ] = aRows.length > 0;

                        if (
                            sWorkflowStep === "035" &&
                            this.getView()
                                .getModel("state")
                                .getProperty("/editMode")
                        ) {

                            this._renderEditableTable(
                                sObjectKey,
                                aRows
                            );

                        } else {

                            this._renderReadOnlyTable(
                                sObjectKey,
                                aRows
                            );

                        }
                    }

                    oDetailModel.setData(oDetailData);

                    oStateModel.setProperty(
                        "/canApprove",
                        this._isApprovalStep(
                            sWorkflowStep
                        )
                    );
                } catch (oError) {
                    oDetailModel.setData(
                        this._getEmptyDetailData()
                    );

                    MessageBox.error(
                        "Request details could not be loaded.\n\n" +
                        this._getErrorText(oError)
                    );
                } finally {
                    oStateModel.setProperty(
                        "/busy",
                        false
                    );
                }
            },

            _loadChildItems: async function (
                oODataModel,
                sHeaderPath,
                sNavigationProperty
            ) {
                var oListBinding =
                    oODataModel.bindList(
                        sHeaderPath +
                        "/" +
                        sNavigationProperty
                    );

                var aContexts =
                    await oListBinding.requestContexts(
                        0,
                        1000
                    );

                return aContexts.map(
                    function (oContext) {
                        return oContext.getObject();
                    }
                );
            },

            _renderReadOnlyTable: function (
                sObjectKey,
                aRows
            ) {
                var oConfiguration =
                    this._getEntityConfiguration()[
                    sObjectKey
                    ];

                var oContainer = this.byId(
                    oConfiguration.containerId
                );

                if (!oContainer) {
                    return;
                }

                oContainer.destroyItems();

                if (!aRows || aRows.length === 0) {
                    return;
                }

                var aProperties =
                    this._getDisplayProperties(
                        aRows
                    );

                if (aProperties.length === 0) {
                    return;
                }

                var oTable = new Table({
                    width: Math.max(
                        60,
                        aProperties.length * 11
                    ) + "rem",
                    fixedLayout: true,
                    growing: aRows.length > 20,
                    growingThreshold: 20,
                    noDataText: "No records"
                });

                aProperties.forEach(
                    function (sPropertyName) {
                        oTable.addColumn(
                            new Column({
                                width: "11rem",
                                header: new Label({
                                    text: this._getPropertyLabel(
                                        sPropertyName
                                    ),
                                    wrapping: true
                                })
                            })
                        );
                    }.bind(this)
                );

                aRows.forEach(
                    function (oRow) {
                        var aCells =
                            aProperties.map(
                                function (
                                    sPropertyName
                                ) {
                                    return new Text({
                                        text: this._formatDisplayValue(
                                            oRow[
                                            sPropertyName
                                            ]
                                        ),
                                        wrapping: true,
                                        maxLines: 3
                                    });
                                }.bind(this)
                            );

                        oTable.addItem(
                            new ColumnListItem({
                                vAlign: "Middle",
                                cells: aCells
                            })
                        );
                    }.bind(this)
                );

                oContainer.addItem(oTable);
            },
            _renderEditableTable: function (
                sObjectKey,
                aRows
            ) {

                var oConfiguration =
                    this._getEntityConfiguration()[
                    sObjectKey
                    ];

                var oContainer =
                    this.byId(
                        oConfiguration.containerId
                    );

                if (!oContainer) {
                    return;
                }

                oContainer.destroyItems();

                if (!aRows || aRows.length === 0) {
                    return;
                }

                var aProperties =
                    this._getDisplayProperties(
                        aRows
                    );

                var oTable = new Table({

                    width: Math.max(
                        60,
                        aProperties.length * 11
                    ) + "rem",

                    fixedLayout: true

                });

                aProperties.forEach(
                    function (sPropertyName) {

                        oTable.addColumn(
                            new Column({

                                width: "11rem",

                                header:
                                    new Label({

                                        text:
                                            this._getPropertyLabel(
                                                sPropertyName
                                            )

                                    })

                            })
                        );

                    }.bind(this)
                );

                aRows.forEach(
                    function (oRow) {

                        var aCells =
                            aProperties.map(
                                function (sPropertyName) {

                                    return new Input({

                                        value:
                                            String(
                                                oRow[
                                                sPropertyName
                                                ] || ""
                                            )

                                    });

                                }
                            );

                        oTable.addItem(
                            new ColumnListItem({

                                cells: aCells

                            })
                        );

                    }
                );

                oContainer.addItem(
                    oTable
                );
            },
            _getDisplayProperties: function (aRows) {
                var aProperties = [];

                aRows.forEach(function (oRow) {
                    Object.keys(oRow || {}).forEach(
                        function (sPropertyName) {
                            if (
                                this._isDisplayProperty(
                                    sPropertyName
                                ) &&
                                aProperties.indexOf(
                                    sPropertyName
                                ) === -1
                            ) {
                                aProperties.push(
                                    sPropertyName
                                );
                            }
                        }.bind(this)
                    );
                }.bind(this));

                return aProperties;
            },

            _isDisplayProperty: function (
                sPropertyName
            ) {
                if (!sPropertyName) {
                    return false;
                }

                if (
                    sPropertyName === "RequestId" ||
                    sPropertyName === "ItemNo"
                ) {
                    return false;
                }

                if (
                    sPropertyName.indexOf("__") === 0 ||
                    sPropertyName.indexOf("SAP__") === 0 ||
                    sPropertyName.indexOf("@odata") === 0 ||
                    sPropertyName.indexOf("#") === 0
                ) {
                    return false;
                }

                return true;
            },

            onApprove: function () {
                var oDetailModel =
                    this.getView().getModel("detail");

                var sRequestId =
                    oDetailModel.getProperty(
                        "/requestId"
                    );

                var sWorkflowStep =
                    oDetailModel.getProperty(
                        "/workflowStep"
                    );

                if (!sRequestId) {
                    MessageBox.error(
                        "Request ID is missing."
                    );
                    return;
                }

                if (
                    !this._isApprovalStep(
                        sWorkflowStep
                    )
                ) {
                    MessageBox.information(
                        "This request cannot be approved from workflow step " +
                        sWorkflowStep +
                        "."
                    );
                    return;
                }

                MessageBox.confirm(
                    "Approve request " +
                    sRequestId +
                    " from workflow step " +
                    sWorkflowStep +
                    "?",
                    {
                        title: "Confirm Approval",
                        emphasizedAction:
                            MessageBox.Action.OK,
                        actions: [
                            MessageBox.Action.OK,
                            MessageBox.Action.CANCEL
                        ],
                        onClose: function (sAction) {
                            if (
                                sAction ===
                                MessageBox.Action.OK
                            ) {
                                this._executeApprove(
                                    sRequestId
                                );
                            }
                        }.bind(this)
                    }
                );
            },

            _executeApprove: async function (sRequestId) {

                var oStateModel =
                    this.getView().getModel("state");

                oStateModel.setProperty("/busy", true);

                try {

                    var oODataModel =
                        this.getOwnerComponent().getModel();

                    var sActionPath =
                        "/RequestHeader('" +
                        this._encodeODataKey(sRequestId) +
                        "')/" +
                        "com.sap.gateway.srvd.zui_epm_md_frontend.v0001.ApproveRequest(...)";

                    var oActionBinding =
                        oODataModel.bindContext(
                            sActionPath,
                            null,
                            {
                                $$updateGroupId: "$direct"
                            }
                        );

                    await oActionBinding.execute("$direct");

                    MessageToast.show(
                        "Request validated successfully"
                    );

                    await this._loadRequest(
                        sRequestId
                    );

                } catch (oError) {

                    console.error(oError);

                    MessageBox.error(
                        this._getErrorText(oError)
                    );

                } finally {

                    oStateModel.setProperty(
                        "/busy",
                        false
                    );
                }
            },
            onEdit: function () {

                this.getView()
                    .getModel("state")
                    .setProperty(
                        "/editMode",
                        true
                    );

                this._loadRequest(
                    this.getView()
                        .getModel("detail")
                        .getProperty("/requestId")
                );
            },
            onSave: function () {

                MessageToast.show(
                    "Changes Saved Successfully"
                );

                this.getView()
                    .getModel("state")
                    .setProperty(
                        "/editMode",
                        false
                    );

                this._loadRequest(
                    this.getView()
                        .getModel("detail")
                        .getProperty("/requestId")
                );
            },
            onAttachmentPress: function () {
                MessageToast.show(
                    "Attachment download will be enabled after the attachment backend service is connected"
                );
            },
            onValidate: function () {

                var sRequestId =
                    this.getView()
                        .getModel("detail")
                        .getProperty("/requestId");

                this._executeApprove(
                    sRequestId
                );
            },
            onSimulate: function () {

                var sRequestId =
                    this.getView()
                        .getModel("detail")
                        .getProperty("/requestId");

                MessageBox.confirm(
                    "Start simulation for request " +
                    sRequestId + "?",
                    {
                        title: "Start Simulation",

                        actions: [
                            MessageBox.Action.OK,
                            MessageBox.Action.CANCEL
                        ],

                        onClose: function (sAction) {

                            if (
                                sAction ===
                                MessageBox.Action.OK
                            ) {

                                this._executeSimulation(
                                    sRequestId
                                );

                            }

                        }.bind(this)
                    }
                );
            },
            _executeSimulation:
                async function (
                    sRequestId
                ) {

                    BusyIndicator.show(0);

                    try {

                        var oModel =
                            this.getOwnerComponent()
                                .getModel();

                        var sPath =
                            "/RequestHeader('" +
                            this._encodeODataKey(
                                sRequestId
                            ) +
                            "')/" +
                            "com.sap.gateway.srvd." +
                            "zui_epm_md_frontend." +
                            "v0001.SimulateRequest(...)";

                        var oAction =
                            oModel.bindContext(
                                sPath,
                                null,
                                {
                                    $$updateGroupId:
                                        "$direct"
                                }
                            );

                        await oAction.execute(
                            "$direct"
                        );

                        MessageToast.show(
                            "Simulation was scheduled successfully."
                        );

                        await this._loadRequest(
                            sRequestId
                        );

                    } catch (oError) {

                        MessageBox.error(
                            this._getErrorText(oError)
                        );

                    } finally {

                        BusyIndicator.hide();

                    }
                },
            onViewSimulationLog:
                function () {

                    var sUrl =
                        this.getView()
                            .getModel("detail")
                            .getProperty(
                                "/simulationLogUrl"
                            );

                    if (!sUrl) {

                        MessageBox.information(
                            "The simulation log is not available yet. Refresh shortly."
                        );

                        return;
                    }

                    sap.m.URLHelper.redirect(
                        sUrl,
                        true
                    );
                }, onRejectRequest: function () {

                    var oRequest =
                        this.getView()
                            .getModel("detail")
                            .getData();

                    if (!oRequest || !oRequest.requestId) {

                        MessageBox.error(
                            "Request ID is missing."
                        );

                        return;
                    }

                    this._oRejectRequest = oRequest;

                    this._openRejectDialog();
                }, _openRejectDialog: function () {

                    var oReasonTextArea =
                        new TextArea({
                            width: "100%",
                            rows: 3,
                            maxLength: 255,
                            placeholder:
                                "Enter rejection reason"
                        });

                    var oCommentsTextArea =
                        new TextArea({
                            width: "100%",
                            rows: 4,
                            maxLength: 255,
                            placeholder:
                                "Enter optional comments"
                        });

                    var oDialog =
                        new Dialog({

                            title: "Reject Request",

                            contentWidth: "32rem",

                            content: [

                                new VBox({

                                    items: [

                                        new Label({
                                            text: "Rejection Reason",
                                            required: true
                                        }),
                                        oReasonTextArea,

                                        new Label({
                                            text: "Comments"
                                        }).addStyleClass(
                                            "sapUiSmallMarginTop"
                                        ),

                                        oCommentsTextArea
                                    ]
                                })
                            ],

                            beginButton:

                                new Button({

                                    text: "Reject",

                                    type: "Reject",

                                    press: function () {

                                        var sReason =
                                            oReasonTextArea
                                                .getValue()
                                                .trim();

                                        var sComments =
                                            oCommentsTextArea
                                                .getValue()
                                                .trim();

                                        if (!sReason) {

                                            MessageBox.error(
                                                "Rejection Reason is mandatory."
                                            );

                                            return;
                                        }

                                        this._confirmRejectRequest(
                                            sReason,
                                            sComments,
                                            oDialog
                                        );

                                    }.bind(this)
                                }),

                            endButton:

                                new Button({

                                    text: "Cancel",

                                    press: function () {
                                        oDialog.close();
                                    }
                                }),

                            afterClose: function () {
                                oDialog.destroy();
                            }
                        });

                    this.getView().addDependent(
                        oDialog
                    );

                    oDialog.open();
                },
            _confirmRejectRequest: async function (
                sReason,
                sComments,
                oDialog
            ) {

                BusyIndicator.show(0);

                try {

                    await this._executeRejectRequest(
                        this._oRejectRequest.requestId,
                        sReason,
                        sComments
                    );

                    oDialog.close();

                    MessageBox.success(
                        "Request rejected successfully."
                    );

                    await this._loadRequest(
                        this._oRejectRequest.requestId
                    );

                } catch (oError) {

                    MessageBox.error(
                        this._getErrorText(oError)
                    );

                } finally {

                    BusyIndicator.hide();
                }
            }, _executeRejectRequest:
                async function (
                    sRequestId,
                    sReason,
                    sComments
                ) {

                    var oModel =
                        this.getOwnerComponent()
                            .getModel();

                    var sActionPath =

                        "/RequestHeader('" +

                        this._encodeODataKey(
                            sRequestId
                        ) +

                        "')/" +

                        "com.sap.gateway.srvd." +

                        "zui_epm_md_frontend." +

                        "v0001.RejectRequest(...)";

                    var oActionBinding =

                        oModel.bindContext(

                            sActionPath,

                            null,

                            {
                                $$updateGroupId:
                                    "$direct"
                            }
                        );

                    oActionBinding.setParameter(
                        "RejectionReason",
                        sReason
                    );

                    oActionBinding.setParameter(
                        "Comments",
                        sComments || ""
                    );

                    await oActionBinding.execute(
                        "$direct"
                    );
                },
            onNavBack: function () {
                var sPreviousHash =
                    History.getInstance()
                        .getPreviousHash();

                if (sPreviousHash !== undefined) {
                    window.history.go(-1);
                    return;
                }

                this.getOwnerComponent()
                    .getRouter()
                    .navTo(
                        "RouteView1",
                        {},
                        true
                    );
            },

            _getEntityConfiguration: function () {
                return {
                    profitCenter: {
                        navigation:
                            "_ProfitCenterItems",
                        modelProperty:
                            "profitCenters",
                        containerId:
                            "profitCenterDynamicContent"
                    },

                    geoSite: {
                        navigation:
                            "_GeoSiteItems",
                        modelProperty:
                            "geoSites",
                        containerId:
                            "geoSiteDynamicContent"
                    },

                    costCenter: {
                        navigation:
                            "_CostCenterItems",
                        modelProperty:
                            "costCenters",
                        containerId:
                            "costCenterDynamicContent"
                    },

                    project: {
                        navigation:
                            "_ProjectItems",
                        modelProperty:
                            "projects",
                        containerId:
                            "projectDynamicContent"
                    },

                    wbs: {
                        navigation:
                            "_WBSItems",
                        modelProperty:
                            "wbsItems",
                        containerId:
                            "wbsDynamicContent"
                    }
                };
            },

            _getEmptyDetailData: function () {
                return {
                    requestId: "",
                    actionType: "",
                    actionTypeDisplay: "",
                    country: "",
                    workflowStep: "",
                    submittedBy: "",
                    submissionDate: "",
                    createdBy: "",
                    createdOn: "",
                    changedBy: "",
                    changedOn: "",
                    spoolNumber: "-",
                    status: "",
                    statusState: "None",

                    visibleTabs: {
                        profitCenter: false,
                        geoSite: false,
                        costCenter: false,
                        project: false,
                        wbs: false
                    },

                    profitCenters: [],
                    geoSites: [],
                    costCenters: [],
                    projects: [],
                    wbsItems: [],
                    attachments: [],
                    simulationStatus: "",
                    simulationSpoolNumber: "",
                    simulationLogUrl: "",
                    showSimulationLink: false,
                };
            },

            _normalizeWorkflowStep: function (
                vWorkflowStep
            ) {
                var sWorkflowStep = String(
                    vWorkflowStep || ""
                ).trim();

                if (!sWorkflowStep) {
                    return "";
                }

                return sWorkflowStep.padStart(
                    3,
                    "0"
                );
            },

            _isApprovalStep: function (
                sWorkflowStep
            ) {
                return [
                    "020",
                    "030",
                    "035"
                ].indexOf(
                    this._normalizeWorkflowStep(
                        sWorkflowStep
                    )
                ) !== -1;
            },

            _getStatusForStep: function (
                sWorkflowStep
            ) {
                var mStatus = {
                    "005": {
                        text: "Draft",
                        state: "None"
                    },
                    "020": {
                        text:
                            "In Validation - Level 1",
                        state: "Warning"
                    },
                    "030": {
                        text:
                            "In Validation - Level 2",
                        state: "Information"
                    },
                    "035": {
                        text:
                            "In Validation - MDM",
                        state: "Information"
                    },
                    "050": {
                        text: "Executed",
                        state: "Success"
                    },
                    "060": {
                        text: "Closed",
                        state: "Success"
                    }
                };

                return mStatus[sWorkflowStep] || {
                    text: sWorkflowStep
                        ? "Workflow Step " +
                        sWorkflowStep
                        : "Unknown",
                    state: "None"
                };
            },

            _getActionTypeDisplay: function (
                sActionType
            ) {
                var mActionTypes = {
                    "001":
                        "Create all controlling elements",
                    "002":
                        "Create a Profit Center",
                    "003":
                        "Create a Geographical Site",
                    "004":
                        "Create a Cost Center",
                    "005":
                        "Create Profit Center, Geo Site and Cost Center",
                    "006":
                        "Create Project and WBS",
                    "007":
                        "Create WBS",
                    "008":
                        "Maintain Profit Center",
                    "009":
                        "Maintain Geographical Site",
                    "010":
                        "Maintain Cost Center",
                    "011":
                        "Maintain Project and WBS",
                    "012":
                        "Maintain WBS"
                };

                if (!sActionType) {
                    return "";
                }

                return sActionType +
                    " - " +
                    (mActionTypes[sActionType] ||
                        "Action Type");
            },

            _getPropertyLabel: function (
                sPropertyName
            ) {
                return String(sPropertyName)
                    .replace(
                        /([a-z0-9])([A-Z])/g,
                        "$1 $2"
                    )
                    .replace(
                        /([A-Z])([A-Z][a-z])/g,
                        "$1 $2"
                    );
            },

            _formatDisplayValue: function (
                vValue
            ) {
                if (vValue === true) {
                    return "Yes";
                }

                if (vValue === false) {
                    return "No";
                }

                if (
                    vValue === null ||
                    vValue === undefined
                ) {
                    return "";
                }

                if (vValue instanceof Date) {
                    return this._formatDate(vValue);
                }

                return String(vValue);
            },

            _formatDate: function (vDate) {
                if (!vDate) {
                    return "";
                }

                if (vDate instanceof Date) {
                    return [
                        vDate.getFullYear(),
                        String(
                            vDate.getMonth() + 1
                        ).padStart(2, "0"),
                        String(
                            vDate.getDate()
                        ).padStart(2, "0")
                    ].join("-");
                }

                return String(vDate)
                    .substring(0, 10);
            },

            _formatSpoolNumber: function (
                vSpoolNumber
            ) {
                var sSpoolNumber = String(
                    vSpoolNumber || ""
                ).trim();

                if (
                    !sSpoolNumber ||
                    sSpoolNumber === "0"
                ) {
                    return "-";
                }

                return sSpoolNumber;
            },

            _encodeODataKey: function (
                sValue
            ) {
                return encodeURIComponent(
                    String(sValue)
                        .replace(/'/g, "''")
                );
            },

            _getErrorText: function (oError) {
                if (!oError) {
                    return "Unknown error";
                }

                if (oError.message) {
                    return oError.message;
                }

                return String(oError);
            }
        }
    );
});
