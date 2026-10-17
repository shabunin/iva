export const EVENTS = {
    PreloadingCompleteEvent: "PRELOADING_COMPLETE_EVENT",
    JoinChangeEvent: "JOIN_CHANGE_EVENT",
    InputFieldEditedEvent: "INPUT_FIELD_EDITED_EVENT",
    KeyboardUpEvent: "KEYBOARD_UP_EVENT",
    KeyboardDownEvent: "KEYBOARD_DOWN_EVENT",
    ObjectPressedEvent: "OBJECT_PRESSED_EVENT",
    ObjectDraggedEvent: "OBJECT_DRAGGED_EVENT",
    ObjectReleasedEvent: "OBJECT_RELEASED_EVENT",
    GUISuspendedEvent: "GUI_SUSPENDED_EVENT",
    GUIResumedEvent: "GUI_RESUMED_EVENT",
    OrientationChangeEvent: "ORIENTATION_CHANGE_EVENT",
    PageFlipEvent: "PAGE_FLIP_EVENT",
    ListWillStartScrollingEvent: "LIST_WILL_START_SCROLLING_EVENT",
    ListDidScrollEvent: "LIST_DID_SCROLL_EVENT",
    ListDidEndScrollingEvent: "LIST_DID_END_SCROLLING_EVENT",
    NetworkStatusChangeEvent: "NETWORK_STATUS_CHANGE_EVENT",
    ConnectionStatusChangeEvent: "CONNECTION_STATUS_CHANGE_EVENT",
    FeedbackMatchedEvent: "FEEDBACK_MATCHED_EVENT",
    MovieInfoReceivedEvent: "MOVIE_INFO_RECEIVED_EVENT",
    MoviePlaybackStateChangedEvent: "MOVIE_PLAYBACK_STATE_CHANGED_EVENT",
    MovieLoadStateChangedEvent: "MOVIE_LOAD_STATE_CHANGED_EVENT",
    DevicePropertyChangedEvent: "DEVICE_PROPERTY_CHANGED_EVENT",
    ApplicationCallbackEvent: "APPLICATION_CALLBACK_EVENT",
    PushNotificationEvent: "PUSH_NOTIFICATION_EVENT",
    // iBeacons in range (Sensors API): callback(beacons) - each { uuid, major, minor, proximity, distance, accuracy, rssi }
    BeaconDetectionEvent: "BEACON_DETECTION_EVENT",
};

export const CONSTANTS = {
    guiURL: "URL",
    GlobalTokensJoin: "e0",
    AnimationCurveLinear: "ANIMATION_CURVE_LINEAR",
    AnimationCurveEaseIn: "ANIMATION_CURVE_EASE_IN",
    AnimationCurveEaseOut: "ANIMATION_CURVE_EASE_OUT",
    AnimationCurveEaseInOut: "ANIMATION_CURVE_EASE_IN_OUT",
    LastItem: "LAST_ITEM",
    AllItems: "ALL_ITEMS",
    TopPosition: "TOP_POSITION",
    LeftPosition: "LEFT_POSITION",
    MiddlePosition: "MIDDLE_POSITION",
    BottomPosition: "BOTTOM_POSITION",
    RightPosition: "RIGHT_POSITION",
    VisiblePosition: "VISIBLE_POSITION",
    RelativePosition: "RELATIVE_POSITION",
    PixelPosition: "PIXEL_POSITION",
    ItemPosition: "ITEM_POSITION",
    AbsolutePosition: "ABSOLUTE_POSITION",
    PortraitOrientation: "PORTRAIT_ORIENTATION",
    LandscapeOrientation: "LANDSCAPE_ORIENTATION",
    LandscapeOrienation: "LANDSCAPE_ORIENTATION", // Legacy typo
    UTF8: "UTF8",
    BINARY: "BINARY",

    // Hash constants
    Hash_MD5: "HASH_MD5",
    Hash_SHA1: "HASH_SHA1",
    Hash_SHA256: "HASH_SHA256",
    Hash_SHA384: "HASH_SHA384",
    Hash_SHA512: "HASH_SHA512",
    
    // CRC constants
    CRC_8: "CRC_8",
    CRC_16: "CRC_16",
    CRC_16_CCITT: "CRC_16_CCITT",
    CRC_16_MODBUS: "CRC_16_MODBUS",
    CRC_32: "CRC_32",
    CRC_32C: "CRC_32C",

    // Output format constants
    OUTPUT_NUMBER: 0,
    OUTPUT_STRING: 1,
    OUTPUT_BINARY: 2,
    OUTPUT_BINARY_LE: 3,

    // Sensors (CF.device.hasSensors' keys; the older names of the two the Sensors API documents below)
    Accelerometer: "ACCELEROMETER",
    Gyroscope: "GYROSCOPE",

    // CF.loadAsset's cache (Utilities API): read from the cache if there, else loaded - and not kept
    // (CACHE_READONLY, the default) or kept (CACHE); always loaded, not kept (NO_CACHE); loaded anew and
    // kept (RECACHE); only taken out of the cache - no callback (DECACHE)
    CACHE_READONLY: "CACHE_READONLY",
    CACHE: "CACHE",
    NO_CACHE: "NO_CACHE",
    RECACHE: "RECACHE",
    DECACHE: "DECACHE",

    // Device properties (CF.setDeviceProperty, DevicePropertyChangedEvent's (property, value))
    ScreenBrightnessProperty: "SCREEN_BRIGHTNESS_PROPERTY",
    SoundOutputVolumeProperty: "SOUND_OUTPUT_VOLUME_PROPERTY",
    BatteryLevelProperty: "BATTERY_LEVEL_PROPERTY",
    BatteryChargeStatusProperty: "BATTERY_CHARGE_STATUS_PROPERTY",
    StatusBarAppearanceProperty: "STATUS_BAR_APPEARANCE_PROPERTY",
    NavigationBarAppearanceProperty: "NAVIGATION_BAR_APPEARANCE_PROPERTY",

    // CF.device.batteryChargeStatus
    CHARGE_UNKNOWN: "CHARGE_UNKNOWN",
    CHARGE_UNPLUGGED: "CHARGE_UNPLUGGED",
    CHARGE_CHARGING: "CHARGE_CHARGING",
    CHARGE_FULL: "CHARGE_FULL",

    // StatusBarAppearanceProperty's values (the text colours: iOS; Android can't change it)
    STATUS_BAR_HIDDEN: "STATUS_BAR_HIDDEN",
    STATUS_BAR_VISIBLE: "STATUS_BAR_VISIBLE",
    STATUS_BAR_WHITE_TEXT: "STATUS_BAR_WHITE_TEXT",
    STATUS_BAR_BLACK_TEXT: "STATUS_BAR_BLACK_TEXT",

    // NavigationBarAppearanceProperty's values (Android)
    NAVIGATION_BAR_HIDDEN: "NAVIGATION_BAR_HIDDEN",
    NAVIGATION_BAR_VISIBLE: "NAVIGATION_BAR_VISIBLE",

    // CF.interceptHardwareKey(keyCode, pressTime, mode, callback) (Android): its modes and key codes
    KEYPRESS_INTERCEPT: "KEYPRESS_INTERCEPT",
    KEYPRESS_OBSERVE: "KEYPRESS_OBSERVE",
    HARDWARE_KEY_BACK: "HARDWARE_KEY_BACK",
    HARDWARE_KEY_VOLUME_UP: "HARDWARE_KEY_VOLUME_UP",
    HARDWARE_KEY_VOLUME_DOWN: "HARDWARE_KEY_VOLUME_DOWN",

    // CF.startMonitoring's sensors (Sensors API)
    AccelerometerSensor: "ACCELEROMETER",
    GyroscopeSensor: "GYROSCOPE",
    AttitudeSensor: "ATTITUDE",
    HeadingSensor: "HEADING",
    LocationSensor: "LOCATION",

    // a detected beacon's proximity (approximate: the docs say to go by distance / accuracy where there)
    BeaconProximityUnknown: "BEACON_PROXIMITY_UNKNOWN",
    BeaconProximityImmediate: "BEACON_PROXIMITY_IMMEDIATE",
    BeaconProximityNear: "BEACON_PROXIMITY_NEAR",
    BeaconProximityFar: "BEACON_PROXIMITY_FAR",
};
