import { CFRenderer } from '../renderer';

export type CFCallback = (...args: any[]) => void;

export interface Watcher {
    joins?: string[] | string;
    systemName?: string;    // for FeedbackMatchedEvent: system filter
    feedbackName?: string;  // for FeedbackMatchedEvent: feedback item name filter
    callback: CFCallback;
}

export interface CFContext {
    renderer: CFRenderer | null;
    tokensStore: Record<string, Record<string, string>>;
    propertiesStore: Record<string, any>;
    listsStore: Record<string, any[]>;
    watchers: Record<string, Watcher[]>;
    device: any;
    ipv4address: string;
    ipv4netmask: string;
    ipv6address: string;
    ipv6netmask: string;
    MACaddress: string;
    networkType: string;
    networkSSID: string;
    system: any;
    systems: Record<string, any>;
    gui: any;
    modules: any[];
    currentPage: string;
    currentOrientation: string;
    requestMode?: 'fetch' | 'socket';

    // EVENTS
    PreloadingCompleteEvent: string;
    JoinChangeEvent: string;
    InputFieldEditedEvent: string;
    KeyboardUpEvent: string;
    KeyboardDownEvent: string;
    ObjectPressedEvent: string;
    ObjectDraggedEvent: string;
    ObjectReleasedEvent: string;
    GUISuspendedEvent: string;
    GUIResumedEvent: string;
    OrientationChangeEvent: string;
    PageFlipEvent: string;
    ListWillStartScrollingEvent: string;
    ListDidScrollEvent: string;
    ListDidEndScrollingEvent: string;
    NetworkStatusChangeEvent: string;
    ConnectionStatusChangeEvent: string;
    FeedbackMatchedEvent: string;
    MovieInfoReceivedEvent: string;
    MoviePlaybackStateChangedEvent: string;
    MovieLoadStateChangedEvent: string;
    DevicePropertyChangedEvent: string;
    ApplicationCallbackEvent: string;
    PushNotificationEvent: string;

    // CONSTANTS
    guiURL: string;
    GlobalTokensJoin: string;
    AnimationCurveLinear: string;
    AnimationCurveEaseIn: string;
    AnimationCurveEaseOut: string;
    AnimationCurveEaseInOut: string;
    LastItem: string;
    AllItems: string;
    TopPosition: string;
    LeftPosition: string;
    MiddlePosition: string;
    BottomPosition: string;
    RightPosition: string;
    VisiblePosition: string;
    RelativePosition: string;
    PixelPosition: string;
    ItemPosition: string;
    AbsolutePosition: string;
    PortraitOrientation: string;
    LandscapeOrientation: string;
    LandscapeOrienation: string;
    UTF8: string;
    BINARY: string;

    // Hash constants
    Hash_MD5: string;
    Hash_SHA1: string;
    Hash_SHA256: string;
    Hash_SHA384: string;
    Hash_SHA512: string;

    // CRC constants
    CRC_8: string;
    CRC_16: string;
    CRC_16_CCITT: string;
    CRC_16_MODBUS: string;
    CRC_32: string;
    CRC_32C: string;

    // Output format constants
    OUTPUT_NUMBER: number;
    OUTPUT_STRING: number;
    OUTPUT_BINARY: number;
    OUTPUT_BINARY_LE: number;

    // Sensors
    Accelerometer: string;
    Gyroscope: string;

    dispatchEvent(eventName: string, ...args: any[]): void;
    parseJoin(join: string): { type: "a" | "d" | "s" | "l", id: string } | null;
}
