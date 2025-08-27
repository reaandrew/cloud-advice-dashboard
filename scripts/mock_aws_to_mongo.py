#!/usr/bin/env python3
"""
Mock AWS Inventory → MongoDB seeder (multi-account)
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Generates realistic-looking mock data shaped like AWS CLI *Describe* APIs,
then inserts documents into MongoDB collections with the SAME schema your
ingestion pipeline produces:

- Each document has a top-level `Configuration` field holding the raw API
  object for that resource (e.g., an EC2 Instance JSON).
- Partitions/metadata are set on every document:
    year, month, day, account_id, resource_id, resource_type
- Collection names match your requested sets:
    autoscaling_groups, ec2, efs_filesystems, elb_classic, elb_v2,
    elb_v2_certificates, elb_v2_listeners, kms_key_metadata, kms_keys,
    rds, redshift_clusters, route53_zones, s3_buckets, security_groups, tags, volumes

NEW:
- Support for generating N accounts (`--accounts`) or a fixed list (`--account-ids`).
- After insert completes, prints and writes a YAML `account_mappings` block with fields:
  OwnerId, Team, Service, Code, "Application Env", "ECS Account", description

Usage:
  python mock_aws_to_mongo.py \
    --mongo-uri "mongodb://localhost:27017/" \
    --db aws_data \
    --region eu-west-2 \
    --date 2025-08-12 \
    --accounts 2 \
    --ec2 10 --asg 3 --elb 3 --efs 2 --kms 5 --rds 2 --redshift 1 --zones 2 --buckets 4 --sg 6 --volumes 10

Or provide explicit account IDs:
  --account-ids 123456789012,234567890123

Requirements:
  pip install pymongo python-dateutil
"""

from __future__ import annotations

import argparse
import datetime as dt
import random
import string
from dataclasses import dataclass
from typing import Dict, List, Tuple

from pymongo import MongoClient, ASCENDING
from pymongo.errors import OperationFailure

# ──────────────────────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────────────────────

def rand_hex(n: int) -> str:
    return "".join(random.choices("0123456789abcdef", k=n))

def rand_str(n: int) -> str:
    alphabet = string.ascii_lowercase + string.digits
    return "".join(random.choices(alphabet, k=n))

def pick(seq):
    return random.choice(seq)

def iso_now():
    return dt.datetime.utcnow().replace(microsecond=0).isoformat() + "Z"

def ensure_indexes(coll):
    try:
        coll.create_index(
            [("year", ASCENDING), ("month", ASCENDING), ("day", ASCENDING),
             ("account_id", ASCENDING), ("resource_id", ASCENDING)],
            unique=True
        )
        coll.create_index("account_id")
        coll.create_index("resource_type")
    except OperationFailure as e:
        print(f"[WARN] Index creation failed for {coll.name}: {e}")

# ──────────────────────────────────────────────────────────────────────────────
# ARN builders
# ──────────────────────────────────────────────────────────────────────────────

def arn(service: str, region: str, account: str, suffix: str) -> str:
    return f"arn:aws:{service}:{region}:{account}:{suffix}"

def arn_s3_bucket(name: str) -> str:
    return f"arn:aws:s3:::{name}"

def arn_route53_zone(zone_id: str) -> str:
    return f"arn:aws:route53:::hostedzone/{zone_id}"

def arn_elb_classic(name: str, region: str, account: str) -> str:
    return arn("elasticloadbalancing", region, account, f"loadbalancer/{name}")

def arn_elbv2(lb_id: str, region: str, account: str) -> str:
    return arn("elasticloadbalancing", region, account, f"loadbalancer/app/{lb_id}/{rand_hex(12)}")

def arn_elbv2_listener(listener_id: str, region: str, account: str) -> str:
    return arn("elasticloadbalancing", region, account, f"listener/app/{listener_id}/{rand_hex(12)}")

def arn_kms_key(key_id: str, region: str, account: str) -> str:
    return arn("kms", region, account, f"key/{key_id}")

def arn_ec2_instance(instance_id: str, region: str, account: str) -> str:
    return arn("ec2", region, account, f"instance/{instance_id}")

def arn_sg(group_id: str, region: str, account: str) -> str:
    return arn("ec2", region, account, f"security-group/{group_id}")

def arn_rds(db_arn_id: str, region: str, account: str) -> str:
    return arn("rds", region, account, f"db:{db_arn_id}")

def arn_redshift_namespace(cluster_id: str, region: str, account: str) -> str:
    return arn("redshift", region, account, f"namespace:{cluster_id}")

# ──────────────────────────────────────────────────────────────────────────────
# Resource generators (Configuration payloads)
# ──────────────────────────────────────────────────────────────────────────────

@dataclass
class Context:
    region: str
    account: str
    y: int
    m: int
    d: int

def gen_ec2_instances(n: int, ctx: Context) -> List[Dict]:
    out = []
    for _ in range(n):
        iid = f"i-{rand_hex(17)}"
        az = f"{ctx.region}{pick(list('abc'))}"
        sgid = f"sg-{rand_hex(8)}"
        cfg = {
            "InstanceId": iid,
            "ImageId": f"ami-{rand_hex(8)}",
            "InstanceType": pick(["t3.micro", "t3.small", "m5.large", "c6g.large"]),
            "PrivateIpAddress": f"10.{random.randint(0,255)}.{random.randint(0,255)}.{random.randint(1,254)}",
            "State": {"Code": 16, "Name": "running"},
            "Placement": {"AvailabilityZone": az},
            "SecurityGroups": [{"GroupName": f"sg-{rand_str(5)}", "GroupId": sgid}],
            "VpcId": f"vpc-{rand_hex(8)}",
            "SubnetId": f"subnet-{rand_hex(8)}",
            "LaunchTime": iso_now(),
            "Arn": arn_ec2_instance(iid, ctx.region, ctx.account),
            "Tags": [{"Key": "Name", "Value": f"mock-{rand_str(6)}"}],
        }
        out.append(cfg)
    return out

def gen_volumes(n: int, ctx: Context) -> List[Dict]:
    out = []
    for _ in range(n):
        vid = f"vol-{rand_hex(12)}"
        cfg = {
            "VolumeId": vid,
            "Size": random.choice([8, 20, 100, 200, 500]),
            "State": "in-use",
            "CreateTime": iso_now(),
            "AvailabilityZone": f"{ctx.region}{pick(list('abc'))}",
            "Attachments": [],
            "Tags": [{"Key": "env", "Value": pick(["dev", "stage", "prod"])}],
            "Arn": arn("ec2", ctx.region, ctx.account, f"volume/{vid}"),
        }
        out.append(cfg)
    return out

def gen_autoscaling_groups(n: int, instances: List[Dict], ctx: Context) -> List[Dict]:
    out = []
    for i in range(n):
        name = f"mock-asg-{i}-{rand_str(4)}"
        asg_arn = arn("autoscaling", ctx.region, ctx.account, f"autoScalingGroup:{rand_hex(12)}:autoScalingGroupName/{name}")
        member_iids = [inst["InstanceId"] for inst in random.sample(instances, k=min(len(instances), random.randint(1, 5)))] if instances else []
        cfg = {
            "AutoScalingGroupName": name,
            "AutoScalingGroupARN": asg_arn,
            "MinSize": 1,
            "MaxSize": max(2, len(member_iids) or 2),
            "DesiredCapacity": len(member_iids) or 1,
            "AvailabilityZones": [f"{ctx.region}{z}" for z in "abc"],
            "VPCZoneIdentifier": ",".join({f"subnet-{rand_hex(8)}" for _ in range(2)}),
            "HealthCheckType": "EC2",
            "CreatedTime": iso_now(),
            "Tags": [{"Key": "app", "Value": "web"}],
            "Instances": [{"InstanceId": iid, "HealthStatus": "Healthy", "LifecycleState": "InService"} for iid in member_iids],
        }
        out.append(cfg)
    return out

def gen_elb_classic(n: int, ctx: Context) -> List[Dict]:
    out = []
    for i in range(n):
        name = f"classic-{i}-{rand_str(5)}"
        cfg = {
            "LoadBalancerName": name,
            "DNSName": f"{name}-{rand_hex(8)}.{ctx.region}.elb.amazonaws.com",
            "CanonicalHostedZoneNameID": rand_hex(12),
            "ListenerDescriptions": [{
                "Listener": {"Protocol": "HTTP", "LoadBalancerPort": 80, "InstanceProtocol": "HTTP", "InstancePort": 80},
                "PolicyNames": []
            }],
            "Policies": {"AppCookieStickinessPolicies": [], "LBCookieStickinessPolicies": [], "OtherPolicies": []},
            "AvailabilityZones": [f"{ctx.region}{z}" for z in "ab"],
            "VPCId": f"vpc-{rand_hex(8)}",
            "Instances": [],
            "CreatedTime": iso_now(),
            "Scheme": "internet-facing",
        }
        out.append(cfg)
    return out

def gen_elbv2(n: int, ctx: Context) -> Tuple[List[Dict], List[Dict], List[Dict]]:
    lbs, listeners, certs = [], [], []
    for i in range(n):
        name = f"app/{rand_str(8)}/{rand_hex(12)}"
        lb_arn = arn("elasticloadbalancing", ctx.region, ctx.account, f"loadbalancer/{name}")
        scheme = pick(["internet-facing", "internal"])
        lb = {
            "LoadBalancerArn": lb_arn,
            "DNSName": f"{name.split('/')[1]}-{rand_hex(6)}.{ctx.region}.elb.amazonaws.com",
            "CanonicalHostedZoneId": rand_hex(12),
            "CreatedTime": iso_now(),
            "LoadBalancerName": name.split('/')[1],
            "Scheme": scheme,
            "VpcId": f"vpc-{rand_hex(8)}",
            "Type": pick(["application", "network"]),
            "IpAddressType": pick(["ipv4", "dualstack"]),
            "AvailabilityZones": [{"ZoneName": f"{ctx.region}{z}", "SubnetId": f"subnet-{rand_hex(8)}"} for z in "ab"],
        }
        lbs.append(lb)

        for proto, port in [("HTTP", 80), ("HTTPS", 443)]:
            listener_arn = arn("elasticloadbalancing", ctx.region, ctx.account, f"listener/{name}/{rand_hex(12)}")
            lst = {
                "ListenerArn": listener_arn,
                "LoadBalancerArn": lb_arn,
                "Port": port,
                "Protocol": proto,
                "DefaultActions": [{"Type": "forward", "TargetGroupArn": arn('elasticloadbalancing', ctx.region, ctx.account, f"targetgroup/{rand_str(8)}/{rand_hex(12)}")}],
                "Certificates": [] if proto == "HTTP" else [{"CertificateArn": arn('acm', ctx.region, ctx.account, f"certificate/{rand_hex(32)}")}],
                "SslPolicy": None if proto == "HTTP" else pick(["ELBSecurityPolicy-2016-08", "ELBSecurityPolicy-TLS-1-2-2017-01"]),
            }
            listeners.append(lst)

            if proto == "HTTPS":
                for c in lst["Certificates"]:
                    certs.append({
                        "CertificateArn": c["CertificateArn"],
                        "IsDefault": True,
                    })
    return lbs, listeners, certs

def gen_efs(n: int, ctx: Context) -> List[Dict]:
    out = []
    for _ in range(n):
        fid = f"fs-{rand_hex(8)}"
        cfg = {
            "OwnerId": ctx.account,
            "CreationToken": rand_str(12),
            "FileSystemId": fid,
            "FileSystemArn": arn("elasticfilesystem", ctx.region, ctx.account, f"file-system/{fid}"),
            "CreationTime": iso_now(),
            "LifeCycleState": "available",
            "NumberOfMountTargets": random.randint(1, 3),
            "SizeInBytes": {"Value": random.randint(1_000_000_000, 10_000_000_000)},
            "PerformanceMode": pick(["generalPurpose", "maxIO"]),
            "Encrypted": pick([True, False]),
        }
        out.append(cfg)
    return out

def gen_kms(n: int, ctx: Context) -> Tuple[List[Dict], List[Dict]]:
    keys, meta = [], []
    for _ in range(n):
        kid = f"{rand_hex(8)}-{rand_hex(4)}-{rand_hex(4)}-{rand_hex(4)}-{rand_hex(12)}"
        karn = arn_kms_key(kid, ctx.region, ctx.account)
        keys.append({"KeyId": kid, "KeyArn": karn})
        meta.append({
            "AWSAccountId": ctx.account,
            "KeyId": kid,
            "Arn": karn,
            "CreationDate": dt.datetime.utcnow(),
            "Enabled": True,
            "KeyUsage": "ENCRYPT_DECRYPT",
            "KeyState": "Enabled",
            "Origin": "AWS_KMS",
            "KeyManager": pick(["CUSTOMER", "AWS"]),
            "CustomerMasterKeySpec": "SYMMETRIC_DEFAULT",
        })
    return keys, meta

def gen_rds(n: int, ctx: Context) -> List[Dict]:
    out = []
    for _ in range(n):
        name = f"{pick(['app','svc','db'])}-{rand_str(6)}"
        arn_id = f"{name}"
        cfg = {
            "DBInstanceIdentifier": name,
            "DBInstanceArn": arn_rds(arn_id, ctx.region, ctx.account),
            "DBInstanceClass": pick(["db.t3.micro", "db.m5.large"]),
            "Engine": pick(["mysql", "postgres", "aurora-postgresql"]),
            "EngineVersion": pick(["8.0.35", "14.10", "13.12"]),
            "DBInstanceStatus": "available",
            "Endpoint": {"Address": f"{name}.abc123.{ctx.region}.rds.amazonaws.com", "Port": 5432},
            "AllocatedStorage": random.choice([20, 100, 200]),
            "StorageType": "gp3",
            "MultiAZ": pick([False, True]),
            "PubliclyAccessible": False,
            "StorageEncrypted": True,
        }
        out.append(cfg)
    return out

def gen_redshift(n: int, ctx: Context) -> List[Dict]:
    out = []
    for _ in range(n):
        cid = f"red-{rand_str(6)}"
        cfg = {
            "ClusterIdentifier": cid,
            "NodeType": pick(["dc2.large", "ra3.4xlarge"]),
            "ClusterStatus": "available",
            "MasterUsername": "admin",
            "DBName": "dev",
            "Endpoint": {"Address": f"{cid}.{ctx.region}.redshift.amazonaws.com", "Port": 5439},
            "ClusterNamespaceArn": arn_redshift_namespace(cid, ctx.region, ctx.account),
        }
        out.append(cfg)
    return out

def gen_route53_zones(n: int) -> List[Dict]:
    out = []
    for _ in range(n):
        zid = f"Z{rand_hex(13).upper()}"
        name = f"{rand_str(6)}.example.com."
        cfg = {
            "Id": f"/hostedzone/{zid}",
            "Name": name,
            "CallerReference": rand_str(12),
            "Config": {"PrivateZone": pick([False, True])},
            "ResourceRecordSetCount": random.randint(2, 50),
        }
        out.append(cfg)
    return out

def gen_s3_buckets(n: int) -> List[Dict]:
    out = []
    for _ in range(n):
        name = f"{rand_str(8)}-bucket"
        cfg = {"Name": name, "CreationDate": dt.datetime.utcnow()}
        out.append(cfg)
    return out

def gen_security_groups(n: int, ctx: Context) -> List[Dict]:
    out = []
    for _ in range(n):
        gid = f"sg-{rand_hex(8)}"
        cfg = {
            "Description": "mock security group",
            "GroupName": f"mock-{rand_str(5)}",
            "IpPermissions": [{
                "IpProtocol": "tcp", "FromPort": 443, "ToPort": 443,
                "IpRanges": [{"CidrIp": "0.0.0.0/0"}]
            }],
            "OwnerId": ctx.account,
            "GroupId": gid,
            "VpcId": f"vpc-{rand_hex(8)}",
            "Arn": arn_sg(gid, ctx.region, ctx.account),
            "Tags": [{"Key": "team", "Value": pick(["core", "ml", "ops"])}],
        }
        out.append(cfg)
    return out

def gen_tags(resources: List[str]) -> List[Dict]:
    tag_keys = ["env", "owner", "service", "cost-center"]
    out = []
    for rid in resources:
        tags = []
        for k in tag_keys:
            if random.random() < 0.8:
                v = pick(["dev", "stage", "prod"]) if k == "env" else rand_str(6)
                tags.append({"Key": k, "Value": v})
        out.append({"ResourceARN": rid, "Tags": tags})
    return out

# ──────────────────────────────────────────────────────────────────────────────
# Resource-id derivation (to match your pipeline’s keys)
# ──────────────────────────────────────────────────────────────────────────────

RESOURCE_ID_MAP = {
    "ec2": "InstanceId",
    "autoscaling_groups": "AutoScalingGroupARN",
    "elb_v2": "LoadBalancerArn",
    "elb_classic": "LoadBalancerName",
    "security_groups": "GroupId",
    "kms_keys": "KeyArn",
    "kms_key_metadata": "Arn",
    "elb_v2_listeners": "ListenerArn",
    "elb_v2_certificates": "CertificateArn",
    "volumes": "VolumeId",
    "rds": "DBInstanceArn",
    "redshift_clusters": "ClusterNamespaceArn",
    "s3_buckets": "Name",
    "route53_zones": "Id",
    "efs_filesystems": "FileSystemId",
    "tags": "ResourceARN",
}

def classic_elb_arn_from_cfg(cfg: Dict, region: str, account: str) -> str:
    name = cfg.get("LoadBalancerName")
    return arn_elb_classic(name, region, account)

def derive_resource_id(coll: str, cfg: Dict, ctx: Context) -> str:
    for key in ("Arn", "ARN", "ResourceArn", "resourceArn", "ResourceARN", "KeyArn"):
        if cfg.get(key):
            return cfg[key]

    if coll == "elb_classic":
        return classic_elb_arn_from_cfg(cfg, ctx.region, ctx.account)
    if coll == "s3_buckets":
        return arn_s3_bucket(cfg["Name"])
    if coll == "route53_zones":
        zid = cfg["Id"].split("/")[-1]
        return arn_route53_zone(zid)

    field = RESOURCE_ID_MAP.get(coll)
    if field and cfg.get(field):
        return cfg[field]

    if coll == "redshift_clusters" and cfg.get("ClusterIdentifier"):
        return arn_redshift_namespace(cfg["ClusterIdentifier"], ctx.region, ctx.account)

    raise ValueError(f"Cannot derive resource_id for {coll}")

def resource_type_from_id(rid: str, coll: str) -> str:
    if rid.startswith("arn:aws:"):
        parts = rid.split(":")
        svc = parts[2]
        suffix = parts[5] if len(parts) > 5 else ""
        if svc == "ec2" and "instance/" in suffix:
            return "instance"
        if svc == "elasticloadbalancing":
            if "listener/" in suffix:
                return "listener"
            if "loadbalancer/" in suffix:
                return "load-balancer"
        if svc == "s3":
            return "bucket"
        if svc == "route53":
            return "hostedzone"
        if svc == "kms":
            return "key"
        if svc == "rds":
            return "db"
        if svc == "redshift":
            return "namespace"
        if svc == "elasticfilesystem":
            return "file-system"
        if svc == "ec2" and "security-group/" in suffix:
            return "security-group"
    return coll

# ──────────────────────────────────────────────────────────────────────────────
# Multi-account helpers & YAML output
# ──────────────────────────────────────────────────────────────────────────────

BASE_TEAM_CHOICES = [
    ("Platform", "Infrastructure Services", "PLAT"),
    ("Application", "Web Services", "APP"),
    ("Data", "Data Platform", "DATA"),
    ("Security", "Security Ops", "SECU"),
    ("ML", "ML Services", "MLSV"),
    ("DevOps", "Development Operations", "DOPS"),
    ("CloudOps", "Cloud Operations", "CLOP"),
    ("SRE", "Site Reliability Engineering", "SRE"),
    ("Analytics", "Analytics Platform", "ANLY"),
    ("API", "API Services", "API"),
    ("Mobile", "Mobile Development", "MOBL"),
    ("Frontend", "Frontend Services", "FRNT"),
    ("Backend", "Backend Services", "BKND"),
    ("QA", "Quality Assurance", "QA"),
    ("Database", "Database Services", "DB"),
    ("Network", "Network Infrastructure", "NET"),
    ("Storage", "Storage Services", "STOR"),
    ("Compute", "Compute Services", "COMP"),
    ("Monitoring", "Monitoring & Observability", "MON"),
    ("Compliance", "Compliance & Governance", "CMPL"),
    ("FinOps", "Financial Operations", "FOPS"),
    ("Integration", "Integration Services", "INTG"),
    ("Messaging", "Messaging Services", "MSG"),
    ("Streaming", "Streaming Platform", "STRM"),
    ("CDN", "Content Delivery", "CDN"),
    ("Edge", "Edge Computing", "EDGE"),
    ("IoT", "Internet of Things", "IOT"),
    ("Blockchain", "Blockchain Services", "BLKC"),
    ("Gaming", "Gaming Platform", "GAME"),
    ("Media", "Media Services", "MDIA"),
]

# Global variable to track generated teams
GENERATED_TEAMS = []

def generate_team_choices(num_teams):
    """Generate team choices with number suffixes if needed"""
    teams = []
    base_teams = BASE_TEAM_CHOICES.copy()
    
    # First, use all base teams
    teams.extend(base_teams[:min(num_teams, len(base_teams))])
    
    # If we need more teams, add numbered variants
    if num_teams > len(base_teams):
        remaining = num_teams - len(base_teams)
        team_counter = 2  # Start with -2 suffix
        
        while len(teams) < num_teams:
            for base_team in base_teams:
                if len(teams) >= num_teams:
                    break
                name, service, code = base_team
                teams.append((
                    f"{name}-{team_counter}",
                    f"{service} {team_counter}",
                    f"{code}{team_counter}"
                ))
            team_counter += 1
    
    return teams

ENV_CHOICES = ["production", "staging", "development", "testing", "integration", "sandbox"]
ECS_ACCOUNT_CHOICES = ["primary", "secondary", "tertiary", "quaternary", "disaster-recovery", "backup"]

def gen_account_ids(args) -> list[str]:
    if args.account_ids:
        ids = [x.strip() for x in args.account_ids.split(",") if x.strip()]
        return ids
    out = set()
    while len(out) < args.accounts:
        out.add("".join(random.choices("0123456789", k=12)))
    return list(out)

def build_account_mapping(owner_id: str) -> dict:
    team, service, code_prefix = random.choice(TEAM_CHOICES)
    code = f"{code_prefix}{random.randint(1, 999):03d}"
    app_env = random.choice(ENV_CHOICES)
    ecs_acct = random.choice(ECS_ACCOUNT_CHOICES)
    return {
        "OwnerId": owner_id,
        "Team": team,
        "Service": service,
        "Code": code,
        "Application Env": app_env,
        "ECS Account": ecs_acct,
        "description": f"{team} team AWS account",
    }

def dump_account_mappings_yaml(mappings: list[dict]) -> str:
    lines = ["account_mappings:"]
    lines.append("  # Map AWS account IDs to team information")
    lines.append("  # Use the actual keys from your data: 'Application Env', 'Code', 'ECS Account', 'OwnerId', 'Service', 'Team'")
    for m in mappings:
        lines.append(f"  - OwnerId: \"{m['OwnerId']}\"")
        lines.append(f"    Team: \"{m['Team']}\"")
        lines.append(f"    Service: \"{m['Service']}\"")
        lines.append(f"    Code: \"{m['Code']}\"")
        lines.append(f"    \"Application Env\": \"{m['Application Env']}\"")
        lines.append(f"    \"ECS Account\": \"{m['ECS Account']}\"")
        lines.append(f"    description: \"{m['description']}\"")
    return "\n".join(lines)

# ──────────────────────────────────────────────────────────────────────────────
# Insertion
# ──────────────────────────────────────────────────────────────────────────────

def insert_many(coll, docs: List[Dict]):
    if not docs:
        return
    ensure_indexes(coll)
    coll.insert_many(docs, ordered=False)

def wrap_doc(cfg: Dict, ctx: Context, coll: str) -> Dict:
    rid = derive_resource_id(coll, cfg, ctx)
    return {
        "Configuration": cfg,
        "year": ctx.y,
        "month": ctx.m,
        "day": ctx.d,
        "account_id": ctx.account,
        "resource_id": rid,
        "resource_type": resource_type_from_id(rid, coll),
    }

def wrap_tag_doc(mapping: Dict, ctx: Context) -> Dict:
    rid = mapping["ResourceARN"]
    tags_map = {t["Key"].lower(): t["Value"] for t in mapping.get("Tags", []) if t.get("Key")}
    return {
        **mapping,
        "year": ctx.y,
        "month": ctx.m,
        "day": ctx.d,
        "account_id": ctx.account,
        "resource_id": rid,
        "resource_type": resource_type_from_id(rid, "tags"),
        "tags": tags_map,
    }

# ──────────────────────────────────────────────────────────────────────────────
# Main
# ──────────────────────────────────────────────────────────────────────────────

def main():
    ap = argparse.ArgumentParser(description="Seed Mongo with mock AWS inventory data (multi-account).")
    ap.add_argument("--mongo-uri", default="mongodb://localhost:27017/")
    ap.add_argument("--db", default="aws_data")
    ap.add_argument("--region", default="us-east-1")
    ap.add_argument("--date", default=None, help="YYYY-MM-DD; defaults to today (UTC)")
    ap.add_argument("--seed", type=int, default=42)

    # Accounts
    ap.add_argument("--accounts", type=int, default=1, help="Number of AWS account IDs to generate. Each account gets the same per-type counts.")
    ap.add_argument("--account-ids", default=None, help="Comma-separated list of 12-digit AWS account IDs to use instead of random generation.")
    ap.add_argument("--mappings-out", default="account_mappings.yaml", help="Where to write the YAML account mappings.")
    ap.add_argument("--teams", type=int, default=10, help="Number of team variations to use (default: 10, max: unlimited with number suffixes)")

    # Random mode
    ap.add_argument("--random", action="store_true", help="Generate random number of resources (1 to max specified) for each type")

    # Counts (apply per account) - increased defaults
    ap.add_argument("--ec2", type=int, default=50, help="Max EC2 instances (default: 50)")
    ap.add_argument("--asg", type=int, default=15, help="Max Auto Scaling Groups (default: 15)")
    ap.add_argument("--elb", type=int, default=20, help="Max ELBv2 load balancers (default: 20)")
    ap.add_argument("--classic-elb", type=int, default=10, help="Max Classic ELBs (default: 10)")
    ap.add_argument("--efs", type=int, default=12, help="Max EFS filesystems (default: 12)")
    ap.add_argument("--kms", type=int, default=30, help="Max KMS keys (default: 30)")
    ap.add_argument("--rds", type=int, default=25, help="Max RDS instances (default: 25)")
    ap.add_argument("--redshift", type=int, default=8, help="Max Redshift clusters (default: 8)")
    ap.add_argument("--zones", type=int, default=15, help="Max Route53 zones (default: 15)")
    ap.add_argument("--buckets", type=int, default=40, help="Max S3 buckets (default: 40)")
    ap.add_argument("--sg", type=int, default=35, help="Max Security Groups (default: 35)")
    ap.add_argument("--volumes", type=int, default=60, help="Max EBS volumes (default: 60)")

    args = ap.parse_args()
    random.seed(args.seed)
    
    # Initialize TEAM_CHOICES based on the --teams argument
    global TEAM_CHOICES
    TEAM_CHOICES = generate_team_choices(args.teams)

    if args.date:
        y, m, d = map(int, args.date.split("-"))
        date = dt.date(y, m, d)
    else:
        today = dt.datetime.utcnow().date()
        date = today

    client = MongoClient(args.mongo_uri)
    db = client[args.db]

    # Accounts to generate
    account_ids = gen_account_ids(args)
    account_mappings = []
    total_counts: Dict[str, int] = {}

    for acct_id in account_ids:
        ctx = Context(region=args.region, account=acct_id, y=date.year, m=date.month, d=date.day)

        # Determine resource counts (random or fixed)
        if args.random:
            ec2_count = random.randint(1, args.ec2)
            volumes_count = random.randint(1, args.volumes)
            asg_count = random.randint(1, args.asg)
            classic_elb_count = random.randint(1, args.classic_elb)
            elb_count = random.randint(1, args.elb)
            efs_count = random.randint(1, args.efs)
            kms_count = random.randint(1, args.kms)
            rds_count = random.randint(1, args.rds)
            redshift_count = random.randint(1, args.redshift)
            zones_count = random.randint(1, args.zones)
            buckets_count = random.randint(1, args.buckets)
            sg_count = random.randint(1, args.sg)
        else:
            ec2_count = args.ec2
            volumes_count = args.volumes
            asg_count = args.asg
            classic_elb_count = args.classic_elb
            elb_count = args.elb
            efs_count = args.efs
            kms_count = args.kms
            rds_count = args.rds
            redshift_count = args.redshift
            zones_count = args.zones
            buckets_count = args.buckets
            sg_count = args.sg

        # Generate for this account
        ec2_cfgs = gen_ec2_instances(ec2_count, ctx)
        vols_cfgs = gen_volumes(volumes_count, ctx)
        asg_cfgs = gen_autoscaling_groups(asg_count, ec2_cfgs, ctx)
        elb_classic_cfgs = gen_elb_classic(classic_elb_count, ctx)
        elbv2_lbs, elbv2_listeners, elbv2_certs = gen_elbv2(elb_count, ctx)
        efs_cfgs = gen_efs(efs_count, ctx)
        kms_keys, kms_meta = gen_kms(kms_count, ctx)
        rds_cfgs = gen_rds(rds_count, ctx)
        red_cfgs = gen_redshift(redshift_count, ctx)
        zones_cfgs = gen_route53_zones(zones_count)
        bucket_cfgs = gen_s3_buckets(buckets_count)
        sgs_cfgs = gen_security_groups(sg_count, ctx)

        # Tag targets
        tag_targets: List[str] = []
        tag_targets += [i.get("Arn") for i in ec2_cfgs if i.get("Arn")]
        tag_targets += [cfg.get("DBInstanceArn") for cfg in rds_cfgs]
        tag_targets += [lb.get("LoadBalancerArn") for lb in elbv2_lbs]
        tag_targets += [arn_route53_zone(z["Id"].split("/")[-1]) for z in zones_cfgs]
        tag_targets += [arn_s3_bucket(b["Name"]) for b in bucket_cfgs]
        tag_targets += [k["KeyArn"] for k in kms_keys]
        tag_targets = [t for t in tag_targets if t]
        tags_cfgs = gen_tags(random.sample(tag_targets, k=min(len(tag_targets), max(2, len(tag_targets)//2))))

        # Insert per-collection
        def insert_cfgs(coll_name: str, cfgs: List[Dict]):
            coll = db[coll_name]
            docs = [wrap_doc(cfg, ctx, coll_name) for cfg in cfgs]
            insert_many(coll, docs)
            total_counts[coll_name] = total_counts.get(coll_name, 0) + len(docs)
            print(f"[{acct_id}] Inserted {len(docs):4d} → {coll_name}")

        insert_cfgs("ec2", ec2_cfgs)
        insert_cfgs("volumes", vols_cfgs)
        insert_cfgs("autoscaling_groups", asg_cfgs)
        insert_cfgs("elb_classic", elb_classic_cfgs)
        insert_cfgs("elb_v2", elbv2_lbs)
        insert_cfgs("elb_v2_listeners", elbv2_listeners)
        insert_cfgs("elb_v2_certificates", elbv2_certs)
        insert_cfgs("efs_filesystems", efs_cfgs)
        insert_cfgs("kms_keys", kms_keys)
        insert_cfgs("kms_key_metadata", kms_meta)
        insert_cfgs("rds", rds_cfgs)
        insert_cfgs("redshift_clusters", red_cfgs)
        insert_cfgs("route53_zones", zones_cfgs)
        insert_cfgs("s3_buckets", bucket_cfgs)
        insert_cfgs("security_groups", sgs_cfgs)

        # Tags
        tag_docs = [wrap_tag_doc(t, ctx) for t in tags_cfgs]
        coll = db["tags"]
        ensure_indexes(coll)
        coll.insert_many(tag_docs, ordered=False)
        total_counts["tags"] = total_counts.get("tags", 0) + len(tag_docs)
        print(f"[{acct_id}] Inserted {len(tag_docs):4d} → tags")

        # Mapping row
        account_mappings.append(build_account_mapping(acct_id))

    # Emit and write YAML mappings
    yaml_text = dump_account_mappings_yaml(account_mappings)
    print("\n" + yaml_text + "\n")
    with open(args.mappings_out, "w") as f:
        f.write(yaml_text)
    print(f"Wrote account mappings → {args.mappings_out}")

    # Summary
    print("Totals across all accounts:")
    for k in sorted(total_counts.keys()):
        print(f"  {k:22s} {total_counts[k]:6d}")

    print("✔ Mock data seeding complete.")

if __name__ == "__main__":
    main()
