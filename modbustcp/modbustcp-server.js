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

    var modbus = require('jsmodbus');
    var util = require('util');

    function ModbusTCPServerNode(config) {

        RED.nodes.createNode(this, config);

        this.host = config.host;
        this.port = config.port;
        this.unit_id = config.unit_id;
        this.modbusconn = null;

        var node = this;

        var serverInfo = ' at ' + node.host + ':' + node.port + ' unit_id: ' + node.unit_id;

        function verbose_warn(logMessage) {
            if (RED.settings.verbose) {
                node.warn('Server -> ' + logMessage + ' at ' + serverInfo);
            }
        }

        function verbose_log(logMessage) {
            if (RED.settings.verbose) {
                node.log('Server -> ' + logMessage + ' at ' + serverInfo);
            }
        }

        node.initializeModbusTCPConnection = function (handler) {


            if (node.modbusconn && node.modbusconn.isConnected()) {
                verbose_log('Connected to modbustcp slave');
            }
            else {
                verbose_log('Connecting to modbustcp slave');

                node.modbusconn = null;
                node.modbusconn = modbus.createTCPClient(config.port, config.host, Number(config.unit_id),
                    function (err) {
                        if (err) {
                            node.error('ModbusTCPConnection: ' + util.inspect(err, false, null));
                            return null;
                        }
                        verbose_log('Server connected');
                        verbose_warn("Server connected");
                    });
            }

            handler(node.modbusconn);
        };

        node.on("close", function () {
            verbose_warn("Server close");
            verbose_log('disconnecting from modbustcp slave');

            if (node.modbusconn && node.modbusconn.isConnected()) {
                node.modbusconn.close();
                node.modbusconn = null;
                verbose_log("Server closed");
                verbose_warn("Server closed");
            }
            else {
                node.modbusconn = null;
                verbose_log("Server closed");
                verbose_warn("Server closed");
            }
        });
    }

    RED.nodes.registerType("modbustcp-server", ModbusTCPServerNode);
};
