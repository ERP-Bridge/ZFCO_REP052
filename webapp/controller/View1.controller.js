sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "sap/ui/export/Spreadsheet"
], function (
    Controller,
    JSONModel,
    MessageToast,
    MessageBox,
    Spreadsheet
) {
    "use strict";

    return Controller.extend("zfcorep052.controller.View1", {
        onInit: function () {
            this.getView().setModel(
                new JSONModel({
                    items: [],
                    filteredItems: []
                }),
                "requests"
            );

            this.getView().setModel(
                new JSONModel({
                    busy: false
                }),
                "state"
            );

            this._loadRequests();
        },

        _loadRequests: async function () {
            var oStateModel = this.getView().getModel("state");
            var oRequestsModel = this.getView().getModel("requests");

            oStateModel.setProperty("/busy", true);

            try {
                var oODataModel = this.getOwnerComponent().getModel();

                if (!oODataModel) {
                    throw new Error(
                        "The default OData V4 model is not configured."
                    );
                }

                var oListBinding = oODataModel.bindList(
                    "/RequestHeader",
                    null,
                    [],
                    [],
                    {
                        $orderby: "ChangedOn desc,ChangedAt desc"
                    }
                );

                var aContexts = await oListBinding.requestContexts(
                    0,
                    500
                );

                var aRequests = aContexts.map(
                    function (oContext) {
                        return this._mapRequestHeader(
                            oContext.getObject()
                        );
                    }.bind(this)
                );

                oRequestsModel.setProperty(
                    "/items",
                    aRequests
                );

                this._applyFilters();
            } catch (oError) {
                oRequestsModel.setProperty("/items", []);
                oRequestsModel.setProperty("/filteredItems", []);

                MessageBox.error(
                    "Requests could not be loaded.\n\n" +
                    this._getErrorText(oError)
                );
            } finally {
                oStateModel.setProperty("/busy", false);
            }
        },

        _mapRequestHeader: function (oHeader) {
            var sWorkflowStep = this._normalizeWorkflowStep(
                oHeader.WorkflowStep
            );

            var oStatus = this._getStatusForStep(
                sWorkflowStep
            );

            var sActionType = String(
                oHeader.ActionType || ""
            );

            return {
                requestId: oHeader.RequestId || "",
                actionType: sActionType,
                actionTypeDisplay: this._getActionTypeDisplay(
                    sActionType
                ),
                country: oHeader.Country || "",
                workflowStep: sWorkflowStep,
                submissionDate: this._formatDate(
                    oHeader.SubmittedOn
                ),
                submittedBy: oHeader.SubmittedBy || "",
                status: oStatus.text,
statusState: oStatus.state,
statusClass: oStatus.statusClass,
                spoolNumber: this._formatSpoolNumber(
                    oHeader.SpoolNumber
                ),
                createdBy: oHeader.CreatedBy || "",
                createdOn: this._formatDate(
                    oHeader.CreatedOn
                ),
                changedBy: oHeader.ChangedBy || "",
                changedOn: this._formatDate(
                    oHeader.ChangedOn
                )
            };
        },

        onSearchRequests: function () {
            this._applyFilters();
        },

        onFilterChange: function () {
            this._applyFilters();
        },

        _applyFilters: function () {
            var oRequestsModel = this.getView().getModel(
                "requests"
            );

            var aRequests = oRequestsModel.getProperty(
                "/items"
            ) || [];

            var oWorkflowStepFilter = this.byId(
                "workflowStepFilter"
            );

            var oSearchField = this.byId(
                "requestSearchField"
            );

            var sSelectedFilter = oWorkflowStepFilter
                ? oWorkflowStepFilter.getSelectedKey()
                : "PENDING";

            var sSearchText = oSearchField
                ? oSearchField.getValue()
                : "";

            sSearchText = String(sSearchText)
                .trim()
                .toLowerCase();

            var aFilteredRequests = aRequests.filter(
                function (oRequest) {
                    var bWorkflowMatch =
                        this._matchesWorkflowFilter(
                            oRequest.workflowStep,
                            sSelectedFilter
                        );

                    if (!bWorkflowMatch) {
                        return false;
                    }

                    if (!sSearchText) {
                        return true;
                    }

                    var sSearchableContent = [
                        oRequest.requestId,
                        oRequest.actionType,
                        oRequest.actionTypeDisplay,
                        oRequest.country,
                        oRequest.submissionDate,
                        oRequest.submittedBy,
                        oRequest.workflowStep,
                        oRequest.status,
                        oRequest.spoolNumber
                    ]
                        .join(" ")
                        .toLowerCase();

                    return sSearchableContent.indexOf(
                        sSearchText
                    ) !== -1;
                }.bind(this)
            );

            oRequestsModel.setProperty(
                "/filteredItems",
                aFilteredRequests
            );

            this._updateRequestCount(
                aFilteredRequests.length
            );
        },

        _matchesWorkflowFilter: function (
            sWorkflowStep,
            sSelectedFilter
        ) {
            if (
                !sSelectedFilter ||
                sSelectedFilter === "ALL"
            ) {
                return true;
            }

            if (sSelectedFilter === "PENDING") {
                return [
                    "020",
                    "030",
                    "035"
                ].indexOf(sWorkflowStep) !== -1;
            }

            return sWorkflowStep ===
                this._normalizeWorkflowStep(
                    sSelectedFilter
                );
        },

        onRefresh: async function () {
            await this._loadRequests();
            MessageToast.show("Requests refreshed");
        },

        onRequestPress: function (oEvent) {
            var oListItem = oEvent.getSource();
            var oBindingContext = oListItem.getBindingContext(
                "requests"
            );

            if (!oBindingContext) {
                MessageBox.error(
                    "The selected request could not be identified."
                );
                return;
            }

            var sRequestId = oBindingContext.getProperty(
                "requestId"
            );

            if (!sRequestId) {
                MessageBox.error("Request ID is missing.");
                return;
            }

            this.getOwnerComponent()
                .getRouter()
                .navTo("RouteRequestDetail", {
                    requestId: encodeURIComponent(
                        sRequestId
                    )
                });
        },

        onTableUpdateFinished: function (oEvent) {
            this._updateRequestCount(
                oEvent.getParameter("actual")
            );
        },

        _updateRequestCount: function (iRequestCount) {
            var iCount = Number(iRequestCount) || 0;
            var oPageTitle = this.byId(
                "requestHistoryTitle"
            );
            var oTableTitle = this.byId(
                "requestTableTitle"
            );
            var oCountStatus = this.byId(
                "requestCountStatus"
            );

            if (oPageTitle) {
                oPageTitle.setText(
                    "Requests for Validation"
                );
            }

            if (oTableTitle) {
                oTableTitle.setText(
                    "Requests (" + iCount + ")"
                );
            }

            if (oCountStatus) {
                oCountStatus.setText(
                    iCount + " request(s)"
                );
            }
        },

        onExport: function () {
            var aRequests = this.getView()
                .getModel("requests")
                .getProperty("/filteredItems") || [];

            if (aRequests.length === 0) {
                MessageToast.show(
                    "No requests are available to export"
                );
                return;
            }

            var aColumns = [
                {
                    label: "Request ID",
                    property: "requestId",
                    type: "String"
                },
                {
                    label: "Action Type",
                    property: "actionTypeDisplay",
                    type: "String"
                },
                {
                    label: "Country",
                    property: "country",
                    type: "String"
                },
                {
                    label: "Submitted On",
                    property: "submissionDate",
                    type: "String"
                },
                {
                    label: "Submitted By",
                    property: "submittedBy",
                    type: "String"
                },
                {
                    label: "Workflow Step",
                    property: "workflowStep",
                    type: "String"
                },
                {
                    label: "Status",
                    property: "status",
                    type: "String"
                },
                {
                    label: "Spool Number",
                    property: "spoolNumber",
                    type: "String"
                }
            ];

            var oSpreadsheet = new Spreadsheet({
                workbook: {
                    columns: aColumns
                },
                dataSource: aRequests,
                fileName: "EPM_Validation_Requests.xlsx",
                worker: false
            });

            oSpreadsheet
                .build()
                .then(function () {
                    MessageToast.show(
                        "Request export completed"
                    );
                })
                .catch(
                    function (oError) {
                        MessageBox.error(
                            "Export failed.\n\n" +
                            this._getErrorText(oError)
                        );
                    }.bind(this)
                )
                .finally(function () {
                    oSpreadsheet.destroy();
                });
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

            return sWorkflowStep.padStart(3, "0");
        },

       _getStatusForStep: function (sWorkflowStep) {

    var mWorkflowStatuses = {

        "005": {
            text: "Draft",
            state: "None",
            statusClass: "statusDraft"
        },

        "020": {
            text: "In Validation - Level 1",
            state: "Warning",
            statusClass: "statusLevel1"
        },

        "030": {
            text: "In Validation - Level 2",
            state: "Information",
            statusClass: "statusLevel2"
        },

        "035": {
            text: "In Validation - Level 3 (MDM)",
            state: "Information",
            statusClass: "statusLevel3"
        },

        "050": {
            text: "Executed",
            state: "Success",
            statusClass: "statusExecuted"
        },

        "055": {
            text: "Rejected",
            state: "Error",
            statusClass: "statusRejected"
        },

        "060": {
            text: "Closed",
            state: "None",
            statusClass: "statusClosed"
        }
    };

    return mWorkflowStatuses[sWorkflowStep] || {
        text: "Unknown",
        state: "None",
        statusClass: "statusClosed"
    };
},

        _getActionTypeDisplay: function (
            sActionType
        ) {
            var mActionTypes = {
                "001": "Create all controlling elements",
                "002": "Create a Profit Center",
                "003": "Create a Geographical Site",
                "004": "Create a Cost Center",
                "005": "Create Profit Center, Geo Site and Cost Center",
                "006": "Create Project and WBS",
                "007": "Create WBS",
                "008": "Maintain Profit Center",
                "009": "Maintain Geographical Site",
                "010": "Maintain Cost Center",
                "011": "Maintain Project and WBS",
                "012": "Maintain WBS"
            };

            if (!sActionType) {
                return "";
            }

            return sActionType + " - " +
                (mActionTypes[sActionType] ||
                    "Action Type");
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

            return String(vDate).substring(0, 10);
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

        _getErrorText: function (oError) {
            if (!oError) {
                return "Unknown error";
            }

            if (oError.message) {
                return oError.message;
            }

            return String(oError);
        }
    });
});
