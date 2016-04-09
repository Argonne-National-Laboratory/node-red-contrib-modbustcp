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

    function ModbusTCPRead(config) {

        RED.nodes.createNode(this, config);

        this.name = config.name;
        this.dataType = config.dataType;
        this.adr = config.adr;
        this.quantity = config.quantity;
        this.rate = config.rate;
        this.rateUnit = config.rateUnit;
        this.connection = null;

        var node = this;
        var modbusTCPServer = RED.nodes.getNode(config.server);
        var timerID;

        function verbose_warn(logMessage) {
            if (RED.settings.verbose) {
                node.warn((node.name) ? node.name + ': ' + logMessage : 'ModbusTCPRead: ' + logMessage);
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
                case "active reading":
                    fillValue = "green";
                    shapeValue = "dot";
                    break;

                case "disconnected":
                case "terminated":
                    fillValue = "red";
                    shapeValue = "ring";
                    break;

                case "polling":
                    fillValue = "yellow";
                    shapeValue = "dot";
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

            node.connection = connection;

            function set_modbus_error(err) {
                if (err) {
                    set_node_status_to("error");
                    verbose_log(err);
                    node.error('ModbusTCPClient: ' + JSON.stringify(err));
                    return false;
                }
                return true;
            }

            function calc_rateByUnit() {

                var rate = 1000;

                switch (node.rateUnit) {
                    case "ms":
                        rate = node.rate; // milli seconds
                        break;
                    case "s":
                        rate = node.rate * 1000; // seconds
                        break;
                    case "m":
                        rate = node.rate * 60000; // minutes
                        break;
                    case "h":
                        rate = node.rate * 3600000; // hours
                        break;
                    default:
                        break;
                }

                return rate;
            }

            node.receiveEventCloseRead = function () {
                if (!node.connection.isConnected()) {
                    set_node_status_to("waiting");
                }
                else {
                    if (!node.connection) {
                        set_node_status_to("disconnected");
                    }
                }
            };

            node.receiveEventConnectRead = function () {
                set_node_status_to("connecting");
                ModbusMaster(); // fire once at start and then by it's fired by the timer event - setInterval
                timerID = setInterval(function () {
                    ModbusMaster();
                }, calc_rateByUnit());
            };

            node.connection.on('close', node.receiveEventCloseRead);
            node.connection.on('connect', node.receiveEventConnectRead);


            function ModbusMaster() {

                var msg = {};
                msg.topic = node.name;

                if (node.connection.isConnected()) {

                    switch (node.dataType) {
                        case "Coil": //FC: 1
                            set_node_status_to("polling");
                            node.connection.readCoils(node.adr, node.quantity, function (resp, err) {
                                if (set_modbus_error(err) && resp) {
                                    set_node_status_to("active reading", resp);
                                    node.send(build_message(resp.coils, resp));
                                }
                            });
                            break;
                        case "Input": //FC: 2
                            set_node_status_to("polling");
                            node.connection.readDiscreteInput(node.adr, node.quantity, function (resp, err) {
                                if (set_modbus_error(err) && resp) {
                                    set_node_status_to("active reading", resp);
                                    node.send(build_message(resp.coils, resp));
                                }
                            });
                            break;
                        case "HoldingRegister": //FC: 3
                            set_node_status_to("polling");
                            node.connection.readHoldingRegister(node.adr, node.quantity, function (resp, err) {
                                if (set_modbus_error(err) && resp) {
                                    set_node_status_to("active reading", resp);
                                    node.send(build_message(resp.register, resp));
                                }
                            });
                            break;
                        case "InputRegister": //FC: 4
                            set_node_status_to("polling");
                            node.connection.readInputRegister(node.adr, node.quantity, function (resp, err) {
                                if (set_modbus_error(err) && resp) {
                                    set_node_status_to("active reading", resp);
                                    node.send(build_message(resp.register, resp));
                                }
                            });
                            break;
                    }
                }
                else {
                    verbose_warn('No Server connection detected on read, Initiating....');
                    clearInterval(timerID);

                    set_node_status_to("waiting");

                    modbusTCPServer.initializeModbusTCPConnection(function (connection) {
                        set_node_status_to("initialized");
                        node.connection = connection;
                        node.connection.on('close', node.receiveEventCloseRead);
                        node.connection.on('connect', node.receiveEventConnectRead);
                    });
                }
            }

        });

        node.on("initialize", function () {
            verbose_warn("read initialize");
            set_node_status_to("initialized");
        });


        node.on("connect", function () {
            verbose_warn("read connect");
            set_node_status_to("connecting");
        });

        node.on("close", function () {
            verbose_warn("read close");
            clearInterval(timerID);
            set_node_status_to("closed");
        });
    }

    RED.nodes.registerType("modbustcp-read", ModbusTCPRead);
};
