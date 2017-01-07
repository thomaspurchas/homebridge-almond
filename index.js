"use strict";

var Almond = require('almond-client'),
    debug = require('debug')('homebridge-platform-almond');

var Accessory, Characteristic, Consumption, Service, TotalConsumption, UUIDGen;

module.exports = function(homebridge) {
    Accessory = homebridge.platformAccessory;
    Characteristic = homebridge.hap.Characteristic;
    Service = homebridge.hap.Service;
    UUIDGen = homebridge.hap.uuid;

    Consumption = function() {
        Characteristic.call(this, 'Consumption', 'E863F10D-079E-48FF-8F27-9C2605A29F52');

        this.setProps({
            format: Characteristic.Formats.UINT16,
            unit: 'W',
            perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
        });

        this.value = this.getDefaultValue();
    };
    require('util').inherits(Consumption, Characteristic);

    homebridge.registerPlatform("homebridge-almond", "Almond", AlmondPlatform, true);
}

function AlmondPlatform(log, config, api) {
    var platform = this;
    this.log = log;
    this.config = config;
    this.api = api;

    this.accessories = [];

    this.log("Starting up, config:", config);

    this.api.on('didFinishLaunching', function() {
        platform.client = new Almond(platform.config);

        platform.client.on("ready", function() {
            platform.client.getDevices().forEach(platform.addAccessory.bind(platform));
        });
    });
}

AlmondPlatform.prototype.addAccessory = function(device) {
    var platform = this;
    var services = [];

    this.log("Got device: %s [%s]", device.name, device.id)

    if (device.props.SwitchBinary !== undefined) {
        services.push(Service.Switch);
    }

    if (services.length === 0) {
        this.log("Not supported: %s [%s]", device.name, device.type);
        return;
    }

    this.log("Found: %s [%s]", device.name, device.type);

    var uuid = UUIDGen.generate(device.id);

    var accessory = this.accessories[uuid];
    if (accessory === undefined) {
        var accessory = new Accessory(device.name, uuid);
        this.api.registerPlatformAccessories("homebridge-platform-almond", "Almond", [accessory]);
    }

    services.forEach(function(service) {
        if (accessory.getService(service) == undefined) {
            accessory.addService(service, device.name);
        }
    });

    this.accessories[accessory.UUID] = new AlmondAccessory(this.log, accessory, device);
}

AlmondPlatform.prototype.configureAccessory = function(accessory) {
    this.log(accessory.displayName, "Configure Accessory");
    accessory.updateReachability(true);
    this.accessories[accessory.UUID] = accessory;
}

function AlmondAccessory(log, accessory, device) {
    var self = this;
    this.accessory = accessory;
    this.device = device;
    this.log = log;

    this.log("Setting up: %s", accessory.displayName);

    // this.accessory.getService(Service.BridgingState)
    //     .getCharacteristic(Characteristic.Reachable)
    //     .on("change", function(old, new1) {
    //         self.log("OLD %S NEW %s", old, new1);
    //     });

    this.updateReachability(true);

    this.accessory.getService(Service.AccessoryInformation)
        .setCharacteristic(Characteristic.Manufacturer, device.manufacturer)
        .setCharacteristic(Characteristic.Model, device.model);

    this.accessory.on('identify', function(paired, callback) {
        self.log("%s - identify", self.accessory.displayName);
        callback();
    });

    this.observeDevice(device);
    this.addEventHandlers();
}

AlmondAccessory.prototype.observeDevice = function(device) {

}

AlmondAccessory.prototype.addEventHandlers = function(device) {
    var self = this;
    var service = this.accessory.getService(Service.Switch);

    if (service === undefined) return;

    service
        .getCharacteristic(Characteristic.On)
        .on('set', this.setSwitchState.bind(this))
        .on('get', this.getSwitchState.bind(this));

    this.device.on('valueUpdated', function(prop, value) {
        self.log("Value updated: %s -> %s [%s]", prop, value, this.id);
        if (this.props.SwitchBinary == prop) {
            value = 'true' === value;
            self.log("Switch state changed to: %s [%s]", value, typeof value);
            self.updateSwitchState(value);
        }
    })
}

AlmondAccessory.prototype.getSwitchState = function(cb) {
    var state = this.device.getProp(this.device.props.SwitchBinary);
    state = state == 'true';// Convert into 1 or 0 from True/False
    this.log(
        "Getting state for: %s and state is %s [%s]",
        this.accessory.displayName,
        state,
        typeof state
    );
    cb(null, state);
}

AlmondAccessory.prototype.setSwitchState = function(state, callback) {
    this.log("Setting switch [%s] to: %s [%s]", this.accessory.displayName, state, typeof state);
    var value = (state | 0) ? true:false;

    this.device.setProp(this.device.props.SwitchBinary, value, callback);
}

AlmondAccessory.prototype.updateSwitchState = function(value) {
    this.log("Updating Switch State to: %s [%s]", value, typeof value);

    var service = this.accessory.getService(Service.Switch);
    service.getCharacteristic(Characteristic.On)
        .updateValue(value);
}

AlmondAccessory.prototype.updateReachability = function(reachable) {
    this.accessory.updateReachability(reachable);
}