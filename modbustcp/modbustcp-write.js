/**
 * Original Work Copyright 2015 Valmet Automation Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * Modified work Copyright 2016 Argonne National Laboratory.
 *
 * Licensed under the the BSD 3-Clause License (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://opensource.org/licenses/BSD-3-Clause
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 **/

module.exports = function (RED) {
    "use strict";
    var util = require('util');

    function ModbusTCPWrite(config) {

        RED.nodes.createNode(this, config);

        this.name = config.name;
        this.dataType = config.dataType;
        this.adr = Number(config.adr);
        this.quantity = config.quantity;

        var node = this;
        var modbusTCPServer = RED.nodes.getNode(config.server);

        function verbose_warn(logMessage) {
            if (RED.settings.verbose) {
                node.warn((node.name) ? node.name + ': ' + logMessage : 'ModbusTCPWrite: ' + logMessage);
            }
        }

        function verbose_log(logMessage) {
            if (RED.settings.verbose) {
                node.log(logMessage);
            }
        }

        function build_message(values, response) {
            return [{payload: values}, {payload: util.inspect(response, false, null)}]
        }

        set_node_status_to("waiting");

        function set_node_status_to(statusValue) {

            verbose_log("write status: " + statusValue);

            var fillValue = "red";
            var shapeValue = "dot";

            switch (statusValue) {

                case "connecting":
                case "connected":
                case "initialized":
                    fillValue = "green";
                    shapeValue = "ring";
                    break;

                case "active":
                case "active writing":
                    fillValue = "green";
                    shapeValue = "dot";
                    break;

                case "disconnected":
                case "terminated":
                    fillValue = "red";
                    shapeValue = "ring";
                    break;

                default:
                    if (!statusValue || statusValue == "waiting") {
                        fillValue = "blue";
                        statusValue = "waiting ...";
                    }
                    break;
            }

            node.status({fill: fillValue, shape: shapeValue, text: statusValue});
        }

        modbusTCPServer.initializeModbusTCPConnection(function (connection) {

            set_node_status_to("initialized");

            node.connection = connection;

            node.receiveEventCloseWrite = function () {
                if (!node.connection.isConnected()) {
                    verbose_log('for writing is not connected');
                    set_node_status_to("closed");
                } else {
                    if (!node.connection) {
                        set_node_status_to("disconnected");
                    }
                }
            };

            node.connection.on('close', node.receiveEventCloseWrite);

        });

        function set_modbus_error(err) {
            if (err) {
                set_node_status_to("error");
                verbose_log(err);
                node.error('ModbusTCPClient: ' + JSON.stringify(err));
                return false;
            }
            return true;
        }

        this.on("input", function (msg) {

                if (!(msg && msg.hasOwnProperty('payload'))) return;

                if (msg.payload == null) {
                    set_node_status_to("payload error");
                    node.error('ModbusTCPWrite: Invalid msg.payload!');
                    return;
                }

                node.status(null);

                if (!node.connection.isConnected()) {
                    set_node_status_to("waiting");
                    return;
                }

                switch (node.dataType) {
                    case "Coil": //FC: 5

                        if (msg.payload.length < node.quantity) {
                            node.error("Quantity should be less or equal to coil payload array Addr: ".join(node.adr, " Q: ", node.quantity));
                        }
                        if (node.quantity > 1) {
                            for (i = node.adr; i < node.quantity; i++) {

                                node.connection.writeSingleCoil(i, msg.payload[i], function (resp, err) {
                                    if (set_modbus_error(err) && resp) {
                                        set_node_status_to("active writing");
                                        node.send(build_message(msg.payload[i], resp));
                                    }
                                });
                            }
                        } else {
                            node.connection.writeSingleCoil(node.adr, msg.payload, function (resp, err) {
                                if (set_modbus_error(err) && resp) {
                                    set_node_status_to("active writing");
                                    node.send(build_message(msg.payload, resp));
                                }
                            });
                        }
                        break;

                    case "HoldingRegister": //FC: 6

                        if (msg.payload.length < node.quantity) {
                            node.error("Quantity should be less or equal to register payload array Addr: ".join(node.adr, " Q: ", node.quantity));
                        }
                        if (node.quantity > 1) {
                            for (i = node.adr; i < node.quantity; i++) {
                                node.connection.writeSingleRegister(i, Number(msg.payload[i]), function (resp, err) {
                                    if (set_modbus_error(err) && resp) {
                                        set_node_status_to("active writing");
                                        node.send(build_message(msg.payload[i], resp));
                                    }
                                });
                            }
                        } else {
                            node.connection.writeSingleRegister(node.adr, Number(msg.payload), function (resp, err) {
                                if (set_modbus_error(err) && resp) {
                                    set_node_status_to("active writing");
                                    node.send(build_message(Number(msg.payload), resp));
                                }
                            });
                        }
                        break;

                    default:
                        break;
                }
            }
        );

        node.on("close", function () {
            verbose_warn("write close");
            set_node_status_to("closed");
            node.connection.removeAllListeners();
            node = null;
        });
    }

    RED.nodes.registerType("modbustcp-write", ModbusTCPWrite);
};
