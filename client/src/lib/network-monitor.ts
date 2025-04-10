export interface NetworkStats {
  rtt: number;
  packetLoss: number;
  bandwidth: number;
  quality: 'excellent' | 'good' | 'fair' | 'poor';
}

export interface NetworkMonitorOptions {
  onQualityChange?: (stats: NetworkStats) => void;
  onConnectionStateChange?: (state: RTCPeerConnectionState) => void;
  qualityThresholds?: {
    excellent: number;
    good: number;
    fair: number;
  };
}

const DEFAULT_THRESHOLDS = {
  excellent: 100, // RTT < 100ms
  good: 200,      // RTT < 200ms
  fair: 500       // RTT < 500ms
};

export class NetworkMonitor {
  private connection: RTCPeerConnection;
  private options: NetworkMonitorOptions;
  private monitorInterval: NodeJS.Timeout | null = null;
  private lastStats: NetworkStats | null = null;

  constructor(connection: RTCPeerConnection, options: NetworkMonitorOptions = {}) {
    this.connection = connection;
    this.options = {
      ...options,
      qualityThresholds: options.qualityThresholds || DEFAULT_THRESHOLDS
    };

    // Monitor connection state changes
    this.connection.addEventListener('connectionstatechange', () => {
      if (this.options.onConnectionStateChange) {
        this.options.onConnectionStateChange(this.connection.connectionState);
      }
    });
  }

  start(interval: number = 2000) {
    if (this.monitorInterval) {
      this.stop();
    }

    this.monitorInterval = setInterval(() => this.checkNetworkQuality(), interval);
  }

  stop() {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }
  }

  private async checkNetworkQuality() {
    try {
      const stats = await this.connection.getStats();
      let rtt = 0;
      let packetLoss = 0;
      let bandwidth = 0;

      stats.forEach(report => {
        if (report.type === 'candidate-pair' && report.state === 'succeeded') {
          rtt = report.currentRoundTripTime ? report.currentRoundTripTime * 1000 : 0;
        }
        
        if (report.type === 'inbound-rtp') {
          const packetsLost = report.packetsLost || 0;
          const packetsReceived = report.packetsReceived || 0;
          packetLoss = packetsReceived > 0 ? (packetsLost / packetsReceived) * 100 : 0;
          
          if (report.bytesReceived && report.timestamp) {
            const timeDiff = report.timestamp - (this.lastStats?.timestamp || report.timestamp);
            const bytesDiff = report.bytesReceived - (this.lastStats?.bytesReceived || 0);
            bandwidth = (bytesDiff * 8) / (timeDiff / 1000); // bits per second
          }
        }
      });

      const quality = this.calculateQuality(rtt);
      const networkStats: NetworkStats = {
        rtt,
        packetLoss,
        bandwidth,
        quality
      };

      if (this.options.onQualityChange) {
        this.options.onQualityChange(networkStats);
      }

      this.lastStats = {
        ...networkStats,
        timestamp: Date.now(),
        bytesReceived: 0 // Will be updated in next iteration
      };

    } catch (error) {
      console.error('Error monitoring network quality:', error);
    }
  }

  private calculateQuality(rtt: number): NetworkStats['quality'] {
    const { excellent, good, fair } = this.options.qualityThresholds!;
    
    if (rtt < excellent) return 'excellent';
    if (rtt < good) return 'good';
    if (rtt < fair) return 'fair';
    return 'poor';
  }

  getLastStats(): NetworkStats | null {
    return this.lastStats;
  }
} 