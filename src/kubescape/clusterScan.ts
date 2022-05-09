import { Renderer, Common } from "@k8slens/extensions";
import { Logger, SCAN_CLUSTER_EVENT_NAME } from "../utils";

function parseScanResult(scanResult: any) {
    const controls = {};
    const frameworks = [];
    
    for (let framework of scanResult) {
        const { controlReports, ...frameworkData } = framework
        for (let control of controlReports) {
            if (control.controlID in controls) {
                continue;
            }
            controls[control.controlID] = control;
        }
        
        frameworks.push(frameworkData);
    }
    return [Object.values(controls), frameworks] as const;
}

export async function scanClusterTask(preferenceStore, reportStore, ipc) {
    if (!preferenceStore.isInstalled) {
      Logger.debug('Kubescape is not installed');
      return;
    }
    const activeEntity = Renderer.Catalog.catalogEntities.activeEntity;
    if (!activeEntity || !(activeEntity instanceof Common.Catalog.KubernetesCluster)) {
      Logger.debug('No cluster selected');
      return;
    }

    const clusterId = activeEntity.getId();
    const clusterName = activeEntity.getName();

    let scanResult = reportStore.scanResults.find(result => result.clusterId == clusterId);

    if (scanResult) {
      if (!scanResult.isScanning) {
        Logger.debug(`Cluster '${clusterName}' - already scanned`);
        return;
      }
    } else {
      reportStore.scanResults.push({
        clusterId: clusterId,
        clusterName: clusterName,
        controls: null,
        frameworks: null,
        isScanning: true,
        time: Date.now()
      });
    }

    Logger.debug(`Invoking cluster scan on '${clusterName}'`);
    const scanClusterResult = await ipc.invoke(SCAN_CLUSTER_EVENT_NAME, clusterName);
    const [controls, frameworks] = parseScanResult(scanClusterResult);

    scanResult = reportStore.scanResults.find(result => result.clusterId == clusterId);

    if (scanResult) {
      // Update Store
      scanResult.controls = controls;
      scanResult.frameworks = frameworks;

      Logger.debug(`Saved scan result of cluster '${clusterName}'`);

      scanResult.isScanning = false;
    } else {
      Logger.error('Scan results error - push was not synced')
    }
  }