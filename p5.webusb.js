if (typeof navigator.usb === "undefined") {
  const errMessage =
    "This browser does not support webusb. Please switch to Chrome when using this webusb add-on.";
  alert(errMessage);
  throw new Error(errMessage);
}

p5.prototype.registerMethod("init", async function () {
  class Playground {
    constructor(device, endpointIn, endpointOut, pInst) {
      this.device = device;
      this.endpointIn = endpointIn;
      this.endpointOut = endpointOut;
      this.pInst = pInst;
      this.open = true;
      if (typeof pInst.playgroundRead === "function") this.#listen();
    }
    async close() {
      await this.device.close();
      this.open = false;
    }
    async #listen() {
      if (!this.open) return;
      const response = await this.device.transferIn(
        this.endpointIn.endpointNumber,
        64
      );
      if (response.data.byteLength === 0) {
        this.#listen();
        return;
      }
      const decoder = new TextDecoder();
      const { data } = response;
      const arr = new Uint8Array(data.buffer);
      const escapeIndex = arr.findIndex(
        (value) => String.fromCharCode(value) === "\n"
      );
      const msg = decoder.decode(arr.slice(1, escapeIndex));
      this.pInst.playgroundRead(msg);
      this.#listen();
    }
    async #send(msg) {
      const encoder = new TextEncoder();
      const outArray = new Uint8Array(64);
      encoder.encodeInto(msg + "\n", outArray);
      await this.device.transferOut(this.endpointOut.endpointNumber, outArray);
    }
  }

  async function setupPlayground(usbDevice) {
    await usbDevice.open();
    await usbDevice.selectConfiguration(1);
    const { configuration } = usbDevice;
    let interface;
    for (let i = 0; i < configuration.interfaces.length; i++) {
      try {
        interface = configuration.interfaces[i];
        await usbDevice.claimInterface(interface.interfaceNumber);
        break;
      } catch (e) {}
    }
    const { alternate } = interface;
    const endpointIn = alternate.endpoints.find(
      (end) => end.direction === "in"
    );
    const endpointOut = alternate.endpoints.find(
      (end) => end.direction === "out"
    );
    return new Playground(
      usbDevice,
      endpointIn,
      endpointOut,
      this._isGlobal ? window : this
    );
  }

  async function pairPlayground() {
    const usbDevice = await navigator.usb.requestDevice({
      filters: [{ classCode: 255, subclassCode: 42 }],
    });
    if (typeof usbDevice === "undefined") {
      alert("Connection failed.");
      throw new Error("Failed connection");
    }
    return await setupPlayground(usbDevice);
  }

  function buttonToggleToPair(button) {
    button.html("Pair Playground Express");
    button.mousePressed(async () => {
      const playground = await pairPlayground();
      buttonToggleToDisconnect(button, playground);
    });
  }

  function buttonToggleToDisconnect(button, playground) {
    button.html("Disconnect Playground Express");
    button.mousePressed(async () => {
      await playground.close();
      buttonToggleToPair(button);
    });
  }

  const toggleButton = this.createButton("");
  const pairedDevices = await navigator.usb.getDevices();
  if (pairedDevices.length) {
    const playground = await setupPlayground(pairedDevices[0]);
    buttonToggleToDisconnect(toggleButton, playground);
  } else {
    buttonToggleToPair(toggleButton);
  }
});
