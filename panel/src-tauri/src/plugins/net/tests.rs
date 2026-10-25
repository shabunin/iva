use super::*;
use tokio::io::AsyncWriteExt;

/// a connection to a peer that takes it and never reads
async fn to_a_peer_not_reading() -> (tokio::net::TcpStream, tokio::net::TcpStream) {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let ours = tokio::net::TcpStream::connect(listener.local_addr().unwrap()).await.unwrap();
    let (theirs, _) = listener.accept().await.unwrap();
    (ours, theirs)
}

#[tokio::test]
async fn keepalive_finds_a_peer_gone_in_seconds() {
    let (ours, _theirs) = to_a_peer_not_reading().await;
    let sock = socket2::SockRef::from(&ours);
    keep_alive(socket2::SockRef::from(&ours), true, Some(10_000)).unwrap();
    assert!(sock.keepalive().unwrap());
    assert_eq!(sock.keepalive_time().unwrap(), Duration::from_secs(10));
    assert_eq!(sock.keepalive_interval().unwrap(), Duration::from_secs(1));
    assert_eq!(sock.keepalive_retries().unwrap(), 10);
    #[cfg(any(target_os = "android", target_os = "linux"))]
    assert_eq!(sock.tcp_user_timeout().unwrap(), Some(Duration::from_secs(20)));
    keep_alive(socket2::SockRef::from(&ours), false, None).unwrap();
    assert!(!sock.keepalive().unwrap());
    #[cfg(any(target_os = "android", target_os = "linux"))]
    assert_eq!(sock.tcp_user_timeout().unwrap(), None);
}

#[tokio::test]
async fn a_close_lets_go_of_a_write_its_peer_does_not_take() {
    let (mut ours, _theirs) = to_a_peer_not_reading().await;
    let stop = CancellationToken::new();
    let later = stop.clone();
    tokio::spawn(async move {
        tokio::time::sleep(Duration::from_millis(200)).await;
        later.cancel();
    });
    // far more than the send buffers hold
    let big = vec![0u8; 64 << 20];
    let r = tokio::time::timeout(Duration::from_secs(5), unless_stopped(&stop, ours.write_all(&big))).await;
    assert!(matches!(r, Ok(None)), "the write was not let go of");
}

#[tokio::test]
async fn a_write_just_before_a_close_goes_out() {
    let (mut ours, mut theirs) = to_a_peer_not_reading().await;
    let stop = CancellationToken::new();
    stop.cancel();
    assert!(matches!(unless_stopped(&stop, ours.write_all(b"bye")).await, Some(Ok(()))));
    drop(ours);
    let mut got = Vec::new();
    tokio::io::AsyncReadExt::read_to_end(&mut theirs, &mut got).await.unwrap();
    assert_eq!(got, b"bye");
}

#[tokio::test]
async fn a_socket_whose_commands_wait_holds_up_no_other() {
    let sockets: Mutex<HashMap<String, Conn<u8>>> = Mutex::new(HashMap::new());
    let (busy, _busy_rx, _) = Conn::<u8>::new(1);
    let (idle, mut idle_rx, _) = Conn::<u8>::new(1);
    sockets.lock().await.insert("busy".into(), busy);
    sockets.lock().await.insert("idle".into(), idle);
    // the busy one's channel full: a command to it waits for room, for ever (its task stuck)
    sender(&sockets, "busy").await.unwrap().send(1).await.unwrap();
    let waiting = async { sender(&sockets, "busy").await.unwrap().send(2).await };
    let other = async {
        sender(&sockets, "idle").await.unwrap().send(3).await.unwrap();
        // and the socket can go
        sockets.lock().await.remove("busy").unwrap().close();
    };
    tokio::select! {
        _ = waiting => panic!("the busy socket took a command"),
        r = tokio::time::timeout(Duration::from_secs(5), other) => assert!(r.is_ok(), "held up by the busy socket"),
    }
    assert_eq!(idle_rx.try_recv().unwrap(), 3);
    assert!(sockets.lock().await.get("busy").is_none());
}

#[tokio::test]
async fn closed_its_commands_end_after_what_it_was_told() {
    let (conn, mut rx, stop) = Conn::<u8>::new(4);
    conn.tx.send(1).await.unwrap();
    conn.close();
    assert!(stop.is_cancelled());
    assert_eq!(rx.recv().await, Some(1));
    assert_eq!(rx.recv().await, None);
}
