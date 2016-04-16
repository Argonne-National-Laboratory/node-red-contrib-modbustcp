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
 * Modified work Copyright 2016 Klaus Landsdorf.
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

    function ModbusTCPResponse(config) {

        RED.nodes.createNode(this, config);

        this.registerShowMax = config.registerShowMax;

        var node = this;

        set_node_status_to("initialized");

        function verbose_warn(logMessage) {
            if (RED.settings.verbose) {
                node.warn((node.name) ? node.name + ': ' + logMessage : 'ModbusTCPResponse: ' + logMessage);
            }
        }

        function verbose_log(logMessage) {
            if (RED.settings.verbose) {
                node.log(logMessage);
            }
        }

        function set_node_status_to(statusValue, response) {

            verbose_log("response status: " + statusValue);

            var fillValue = "red";
            var shapeValue = "dot";

            switch (statusValue) {

                case "initialized":
                    fillValue = "green";
                    shapeValue = "ring";
                    break;

                case "active":
                    fillValue = "green";
                    shapeValue = "dot";
                    break;

                default:
                    if (!statusValue || statusValue == "waiting") {
                        fillValue = "blue";
                        statusValue = "waiting ...";
                    }
                    break;
            }

            node.status({fill: fillValue, shape: shapeValue, text: util.inspect(response, false, null)});
        }

        node.on("input", function (msg) {

            if (msg.payload.register.length > node.registerShowMax) {

                node.status({
                    fill: 'green',
                    shape: 'dot',
                    text: 'fc: ' + msg.payload.fc + ' byteCount: ' + msg.payload.byteCount + ' registerCount: ' + msg.payload.register.length
                });
            } else {
                set_node_status_to("active", msg.payload);
            }
        });

        node.on("close", function () {
            verbose_warn("read close");
            set_node_status_to("closed");
        });
    }

    RED.nodes.registerType("modbustcp-response", ModbusTCPResponse);
};
